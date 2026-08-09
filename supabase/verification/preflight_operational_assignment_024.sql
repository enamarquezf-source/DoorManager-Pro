-- Preflight 024 - correccion operativa post 023. Solo lectura, no requiere objetos 024.

select 'required_tables_024' as check_name, table_name, count(*) as present
from information_schema.tables
where table_schema = 'public'
  and table_name = any(array['work_orders','work_order_assignments','work_order_time_entries','work_order_materials','checks','profiles','work_order_status_history'])
group by table_name
order by table_name;

select 'required_columns_024' as check_name, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'work_order_assignments' and column_name = any(array['work_order_id','technician_id','status','deleted_at']))
    or (table_name = 'work_orders' and column_name = any(array['status','deleted_at','main_technician_id','current_responsible_id','company_id']))
    or (table_name = 'checks' and column_name = any(array['work_order_id','technician_id','status','deleted_at']))
    or (table_name = 'work_order_time_entries' and column_name = any(array['work_order_id','profile_id','duration_minutes']))
    or (table_name = 'work_order_materials' and column_name = any(array['work_order_id','registered_by','local_change_id','used_quantity'])))
order by table_name, column_name;

select 'active_assignment_leaks_before_024' as check_name,
       count(*) filter (where a.deleted_at is null and a.status in ('Finalizado','Cancelado')) as inactive_status_still_not_deleted,
       count(*) filter (where a.deleted_at is null and wo.status in ('Finalizado tecnicamente','Pendiente de envio','Enviado','Cerrado','Cancelado')) as assignments_on_finished_work
from public.work_order_assignments a
join public.work_orders wo on wo.id = a.work_order_id;

select 'pending_checks_with_inactive_assignment_before_024' as check_name,
       count(*) as rows
from public.checks ch
join public.work_orders wo on wo.id = ch.work_order_id
left join public.work_order_assignments a on a.work_order_id = ch.work_order_id and a.technician_id = ch.technician_id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')
where ch.deleted_at is null
  and ch.status in ('Por realizar','En curso')
  and ch.technician_id is not null
  and (wo.deleted_at is not null or wo.status in ('Finalizado tecnicamente','Pendiente de envio','Enviado','Cerrado','Cancelado') or a.id is null);

select 'technician_history_candidates_before_024' as check_name,
       count(*) as rows,
       count(*) filter (where a.deleted_at is not null or a.status = 'Cancelado') as desasignaciones_visibles_por_rpc_024
from public.work_order_assignments a
join public.work_orders wo on wo.id = a.work_order_id
where a.status in ('Finalizado','Cancelado')
   or a.deleted_at is not null
   or wo.status in ('Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado');

select 'commercial_responsible_candidates_before_024' as check_name,
       count(*) as rows
from public.work_orders wo
where wo.deleted_at is null
  and wo.current_responsible_id is not null;

select 'rpc_permissions_before_024' as check_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['dmp_upsert_work_order_time_entry','dmp_upsert_work_order_material','dmp_change_work_order_status','unassign_work_order_profile','technician_global_search','technician_assignment_history'])
order by p.proname, arguments;
