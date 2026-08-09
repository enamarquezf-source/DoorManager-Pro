-- Verificacion posterior 022 - ciclo de vida seguro

select 'lifecycle_functions_exist' as check_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['dmp_lifecycle_dependencies','dmp_archive_entity','dmp_restore_entity','dmp_permanently_delete_entity'])
order by p.proname;

select 'lifecycle_private_helpers_not_public' as check_name,
       p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['dmp_lifecycle_allowed_entities','dmp_lifecycle_target_company','dmp_assert_lifecycle_actor','dmp_record_lifecycle_audit','dmp_previous_lifecycle_value','dmp_assert_profile_lifecycle_target'])
order by p.proname;

select 'register_work_order_deficiency_privileges' as check_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       position('v_component text := trim' in pg_get_functiondef(p.oid)) > 0 as declares_v_component
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'register_work_order_deficiency';

with critical_rpc(function_name, arguments) as (values
  ('create_deficiency_from_check', 'p_check_id uuid, p_item_id uuid, p_severity text, p_description text, p_recommended_action text, p_responsible uuid'),
  ('finish_check_safe', 'p_check_id uuid, p_observations text'),
  ('register_work_order_deficiency', 'p_payload jsonb'),
  ('request_work_order_return', 'p_work_order_id uuid, p_changed_by uuid, p_reason text'),
  ('superadmin_update_profile', 'p_profile_id uuid, p_profile jsonb'),
  ('sync_work_order_material_usage', 'p_work_order_id uuid, p_description text, p_quantity numeric, p_local_change_id text')
), matched as (
  select c.function_name,
         c.arguments,
         p.oid,
         coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_execute,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from critical_rpc c
  left join pg_proc p on p.proname = c.function_name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where n.nspname = 'public'
    and pg_get_function_identity_arguments(p.oid) = c.arguments
)
select 'critical_rpc_permissions_after_022' as check_name,
       case when anon_execute or public_execute then 'FAIL' else 'OK' end as status,
       function_name,
       arguments,
       public_execute,
       anon_execute,
       authenticated_execute
from matched
order by function_name;

with critical_rpc(function_name, arguments) as (values
  ('create_deficiency_from_check', 'p_check_id uuid, p_item_id uuid, p_severity text, p_description text, p_recommended_action text, p_responsible uuid'),
  ('finish_check_safe', 'p_check_id uuid, p_observations text'),
  ('register_work_order_deficiency', 'p_payload jsonb'),
  ('request_work_order_return', 'p_work_order_id uuid, p_changed_by uuid, p_reason text'),
  ('superadmin_update_profile', 'p_profile_id uuid, p_profile jsonb'),
  ('sync_work_order_material_usage', 'p_work_order_id uuid, p_description text, p_quantity numeric, p_local_change_id text')
), matched as (
  select c.function_name,
         p.oid,
         coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_execute,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from critical_rpc c
  left join pg_proc p on p.proname = c.function_name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where n.nspname = 'public'
    and pg_get_function_identity_arguments(p.oid) = c.arguments
)
select 'critical_rpc_summary_after_022' as check_name,
       case when count(*) = 6 and count(*) filter (where anon_execute or public_execute) = 0 then 'OK' else 'FAIL' end as status,
       count(*) as critical_rpc_count,
       count(*) filter (where anon_execute) as anon_execute_count,
       count(*) filter (where public_execute) as public_execute_count,
       count(*) filter (where authenticated_execute) as authenticated_execute_count
from matched;

begin;
-- Verificacion manual opcional en entorno de pruebas: sustituir los UUID por fixtures reales.
-- select public.dmp_archive_entity('work_orders', '00000000-0000-0000-0000-000000000000'::uuid, 'verify rollback');
-- El segundo archivado del mismo fixture debe fallar con: El registro ya está archivado.
-- select public.dmp_archive_entity('work_orders', '00000000-0000-0000-0000-000000000000'::uuid, 'verify rollback repeated archive');
-- select public.dmp_restore_entity('work_orders', '00000000-0000-0000-0000-000000000000'::uuid, 'verify rollback');
-- La segunda restauracion del mismo fixture debe fallar con: El registro no está archivado.
-- select public.dmp_restore_entity('work_orders', '00000000-0000-0000-0000-000000000000'::uuid, 'verify rollback repeated restore');
rollback;

select 'archived_read_policies' as check_name, tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename = any(array['clients','sites','equipment','cases','work_orders','checks'])
  and policyname = any(array['clients_select_business','sites_select_business','equipment_select_business','cases_select_scoped','work_orders_select_by_role','checks_select_by_role'])
order by tablename, policyname;

select 'audit_targets_ready' as check_name,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'audit_log') as audit_log_table,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'activity_log') as activity_log_table;
