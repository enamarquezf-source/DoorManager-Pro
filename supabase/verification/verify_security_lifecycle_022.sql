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
  and p.proname = any(array['dmp_lifecycle_allowed_entities','dmp_lifecycle_target_company','dmp_assert_lifecycle_actor','dmp_record_lifecycle_audit'])
order by p.proname;

select 'archived_read_policies' as check_name, tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename = any(array['clients','sites','equipment','cases','work_orders','checks'])
  and policyname = any(array['clients_select_business','sites_select_business','equipment_select_business','cases_select_scoped','work_orders_select_by_role','checks_select_by_role'])
order by tablename, policyname;

select 'audit_targets_ready' as check_name,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'audit_log') as audit_log_table,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'activity_log') as activity_log_table;
