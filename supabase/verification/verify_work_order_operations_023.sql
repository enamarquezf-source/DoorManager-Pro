-- Verificacion posterior 023 - horas, materiales, estado directo y borrado controlado

select 'work_order_time_entries_ready' as check_name,
       count(*) filter (where column_name = 'duration_minutes') as duration_column,
       count(*) filter (where column_name = 'manual_duration') as manual_duration_column,
       count(*) filter (where column_name = 'hour_type') as hour_type_column
from information_schema.columns
where table_schema = 'public'
  and table_name = 'work_order_time_entries';

select 'work_order_materials_ready_023' as check_name,
       count(*) filter (where column_name = 'description') as description_column,
       count(*) filter (where column_name = 'registered_by') as registered_by_column,
       count(*) filter (where column_name = 'local_change_id') as local_change_id_column
from information_schema.columns
where table_schema = 'public'
  and table_name = 'work_order_materials';

with critical_rpc(function_name, arguments) as (values
  ('dmp_upsert_work_order_time_entry', 'p_payload jsonb'),
  ('dmp_delete_work_order_time_entry', 'p_time_entry_id uuid, p_reason text'),
  ('dmp_upsert_work_order_material', 'p_payload jsonb'),
  ('dmp_delete_work_order_material', 'p_material_usage_id uuid, p_reason text'),
  ('dmp_change_work_order_status', 'p_work_order_id uuid, p_new_status text, p_reason text'),
  ('dmp_lifecycle_dependencies_enhanced', 'p_entity text, p_entity_id uuid'),
  ('dmp_permanently_delete_entity', 'p_entity text, p_entity_id uuid, p_reason text, p_confirmation text')
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
select 'critical_rpc_after_023' as check_name,
       case when anon_execute or public_execute or authenticated_execute is not true then 'FAIL' else 'OK' end as status,
       function_name,
       arguments,
       public_execute,
       anon_execute,
       authenticated_execute
from matched
order by function_name;

select 'controlled_delete_plan_after_023' as check_name,
       count(*) filter (where p.proname = 'dmp_lifecycle_delete_plan') as delete_plan_fn,
       count(*) filter (where p.proname = 'dmp_lifecycle_dependencies_enhanced') as enhanced_dependencies_fn,
       count(*) filter (where p.proname = 'dmp_lifecycle_dependencies') as original_dependencies_fn
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['dmp_lifecycle_delete_plan','dmp_lifecycle_dependencies_enhanced','dmp_lifecycle_dependencies']);

select 'work_order_materials_local_change_indexes_after_023' as check_name,
       indexname,
       indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'work_order_materials'
  and indexdef ilike '%local_change_id%'
order by indexname;

select 'storage_cleanup_queue_after_023' as check_name,
       count(*) filter (where table_name = 'storage_cleanup_queue') as table_present,
       count(*) filter (where column_name = 'file_id') as file_id_column,
       count(*) filter (where column_name = 'path') as path_column,
       count(*) filter (where column_name = 'status') as status_column
from information_schema.columns
where table_schema = 'public'
  and table_name = 'storage_cleanup_queue';

with private_rpc(function_name, arguments) as (values
  ('dmp_active_profile', ''),
  ('dmp_assert_work_order_operator', 'p_work_order_id uuid, p_manage_all boolean'),
  ('dmp_work_minutes', 'p_start time without time zone, p_end time without time zone, p_break integer, p_manual integer'),
  ('dmp_lifecycle_delete_plan', 'p_entity text, p_entity_id uuid'),
  ('dmp_deficiency_blocking_reference_count', 'p_deficiency_ids uuid[]'),
  ('dmp_file_reference_count', 'p_file_id uuid'),
  ('dmp_queue_storage_cleanup', 'p_file_ids uuid[], p_requested_by uuid, p_reason text'),
  ('dmp_commercial_can_manage_work_order', 'p_work public.work_orders, p_profile public.profiles')
), matched as (
  select c.function_name,
         c.arguments,
         coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_execute,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from private_rpc c
  left join pg_proc p on p.proname = c.function_name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where n.nspname = 'public'
    and pg_get_function_identity_arguments(p.oid) = c.arguments
)
select 'private_rpc_after_023' as check_name,
       case when public_execute or anon_execute or authenticated_execute then 'FAIL' else 'OK' end as status,
       *
from matched
order by function_name;

select 'deficiency_fk_classification_after_023' as check_name,
       conrelid::regclass::text as source_table,
       conname,
       case when conrelid = 'public.corrective_actions'::regclass and pg_get_constraintdef(oid) ilike '%(deficiency_id)%' then 'cascade_child'
            else 'blocking_unclassified'
       end as classification,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid = 'public.deficiencies'::regclass
order by classification, source_table, conname;

begin;
-- Verificacion manual opcional en entorno de pruebas: sustituir UUID por fixtures reales.
-- select public.dmp_change_work_order_status('00000000-0000-0000-0000-000000000000'::uuid, 'Pausado', 'verify rollback direct status');
-- select public.dmp_upsert_work_order_time_entry('{"work_order_id":"00000000-0000-0000-0000-000000000000","work_date":"2026-08-09","started_at":"08:00","ended_at":"10:30","break_minutes":15,"hour_type":"normal","description":"Verificacion rollback"}'::jsonb);
-- select public.dmp_upsert_work_order_material('{"work_order_id":"00000000-0000-0000-0000-000000000000","description":"Material rollback","quantity":1,"unit":"ud","local_change_id":"verify-rollback"}'::jsonb);
rollback;
