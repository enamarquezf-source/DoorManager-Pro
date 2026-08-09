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
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array[
    'dmp_lifecycle_dependencies','dmp_archive_entity','dmp_restore_entity','dmp_permanently_delete_entity',
    'finish_check_safe','request_work_order_return','create_deficiency_from_check','sync_work_order_material_usage',
    'assign_technician','unassign_work_order_profile','manage_work_order_assignments','superadmin_update_profile'
  ])
order by p.proname;

select 'archivable_counts' as check_name,
       (select count(*) from public.clients) as clients,
       (select count(*) from public.sites) as sites,
       (select count(*) from public.equipment) as equipment,
       (select count(*) from public.work_orders) as work_orders,
       (select count(*) from public.checks) as checks;
