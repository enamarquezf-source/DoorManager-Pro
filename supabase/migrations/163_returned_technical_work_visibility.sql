-- Conserva la misma vista y RLS; muestra trabajo activo devuelto por SAT y partes sin centro.
-- No reactiva asignaciones finalizadas ni modifica partes, facturas o stock.
begin;
create or replace view public.v_technician_daily_schedule
with (security_invoker = true) as
select
  a.company_id,
  a.assignment_date,
  a.planned_start_time,
  a.planned_end_time,
  a.status as assignment_status,
  p.id as technician_id,
  trim(p.first_name || ' ' || p.last_name) as technician_name,
  wo.id as work_order_id,
  wo.code as work_order_code,
  wo.title,
  wo.status as work_order_status,
  c.legal_name as client_name,
  s.name as site_name,
  e.code as equipment_code,
  a.id as assignment_id,
  a.role as assignment_role,
  wo.code,
  wo.description,
  wo.description as work_order_description,
  wo.type,
  wo.priority,
  wo.scheduled_date,
  wo.scheduled_time,
  wo.planned_material,
  c.id as client_id,
  s.id as site_id,
  s.address as site_address,
  e.id as equipment_id,
  ar.description as access_description,
  checks.pending_checks_count,
  checks.check_statuses,
  checks.pending_check_ids,
  checks.first_check_status as check_status
from public.work_order_assignments a
join public.profiles p on p.id = a.technician_id and p.active = true and p.deleted_at is null
join public.work_orders wo on wo.id = a.work_order_id and wo.deleted_at is null and wo.status in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Devuelto por SAT')
join public.clients c on c.id = wo.client_id and c.deleted_at is null
left join public.sites s on s.id = wo.site_id and s.deleted_at is null
left join public.equipment e on e.id = wo.main_equipment_id and e.deleted_at is null
left join public.access_requirements ar on ar.id = wo.access_requirement_id
left join lateral (
  select count(*) filter (where ch.status <> 'Realizado')::integer as pending_checks_count,
         array_agg(ch.status order by ch.created_at desc) as check_statuses,
         array_agg(ch.id order by ch.created_at desc) filter (where ch.status <> 'Realizado') as pending_check_ids,
         (array_agg(ch.status order by ch.created_at desc))[1] as first_check_status
  from public.checks ch
  where ch.work_order_id = wo.id and ch.deleted_at is null and ch.status <> 'Realizado' and (ch.technician_id = a.technician_id or ch.technician_id is null)
) checks on true
where a.deleted_at is null and a.status not in ('Finalizado','Cancelado');
notify pgrst, 'reload schema';
commit;
