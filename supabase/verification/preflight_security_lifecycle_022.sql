-- Preflight 022 - ciclo de vida seguro
-- Ejecutar antes de aplicar supabase/migrations/022_security_lifecycle_controls.sql.

select 'migration_018_duplicates' as check_name, count(*) as duplicate_018_files
from (values
  ('018_normalize_sat_roles.sql'),
  ('018_preflight_reconcile_dependencies.sql'),
  ('018_rpc_reconcile_missing_frontend_functions.sql')
) files(name);

select 'required_tables' as check_name, table_name, count(*) as present
from information_schema.tables
where table_schema = 'public'
  and table_name = any(array['clients','sites','equipment','cases','work_orders','checks','check_templates','profiles','audit_log','activity_log'])
group by table_name
order by table_name;

select 'soft_delete_columns' as check_name, table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = any(array['clients','sites','equipment','cases','work_orders','checks','profiles'])
  and column_name in ('deleted_at','active','status')
order by table_name, column_name;

select 'security_definer_public_execute_before_022' as check_name,
       n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'dmp_lifecycle_dependencies','dmp_archive_entity','dmp_restore_entity','dmp_permanently_delete_entity',
    'finish_check_safe','request_work_order_return','create_deficiency_from_check','sync_work_order_material_usage',
    'assign_technician','unassign_work_order_profile','manage_work_order_assignments','superadmin_update_profile'
    ,'register_work_order_deficiency'
  ])
order by p.proname;

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
select 'critical_rpc_permissions_before_022' as check_name,
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
select 'critical_rpc_summary_before_022' as check_name,
       count(*) as critical_rpc_count,
       count(*) filter (where anon_execute) as anon_execute_count,
       count(*) filter (where public_execute) as public_execute_count,
       count(*) filter (where authenticated_execute) as authenticated_execute_count
from matched;

select 'operational_superadmin_count' as check_name,
       count(*) as active_superadmins
from public.profiles p
where p.active = true
  and p.deleted_at is null
  and (
    p.primary_area = 'superadmin'
    or exists (
      select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
      where pr.profile_id = p.id and r.name = 'superadmin'
    )
  );

select 'archivable_counts' as check_name,
       (select count(*) from public.clients) as clients,
       (select count(*) from public.sites) as sites,
       (select count(*) from public.equipment) as equipment,
       (select count(*) from public.work_orders) as work_orders,
       (select count(*) from public.checks) as checks;
