-- Preflight 025 - horas multi-trabajador. Solo lectura.

select 'time_entries_columns_before_025' as check_name,
       ordinal_position,
       column_name,
       data_type,
       is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'work_order_time_entries'
order by ordinal_position;

select 'time_entries_audit_gaps_before_025' as check_name,
       count(*) as total_rows,
       count(*) filter (where created_by is null) as missing_created_by,
       count(*) filter (where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = 'work_order_time_entries' and c.column_name = 'updated_by')) as updated_by_column_missing_marker
from public.work_order_time_entries;

select 'active_assignment_candidates_before_025' as check_name,
       wo.id as work_order_id,
       wo.code,
       count(a.*) filter (where a.deleted_at is null and a.status not in ('Finalizado','Cancelado')) as active_assignments,
       count(a.*) filter (where a.deleted_at is not null or a.status in ('Finalizado','Cancelado')) as inactive_assignments
from public.work_orders wo
left join public.work_order_assignments a on a.work_order_id = wo.id
where wo.deleted_at is null
group by wo.id, wo.code
order by active_assignments desc, wo.code
limit 20;

select 'rpc_permissions_before_025' as check_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['dmp_upsert_work_order_time_entry','dmp_delete_work_order_time_entry','dmp_work_order_time_worker_options','dmp025_actor_profile','dmp025_has_active_assignment','dmp025_assert_time_target'])
order by p.proname, arguments;
