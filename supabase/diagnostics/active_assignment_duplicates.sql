-- Diagnostico de asignaciones activas duplicadas por tecnico y parte.
-- Si esta consulta devuelve filas, revisar los registros antes de crear un indice unico parcial.

select
  company_id,
  work_order_id,
  technician_id,
  count(*) as active_assignments,
  array_agg(id order by created_at) as assignment_ids,
  array_agg(assignment_date order by created_at) as assignment_dates,
  array_agg(role order by created_at) as roles
from public.work_order_assignments
where deleted_at is null
group by company_id, work_order_id, technician_id
having count(*) > 1
order by active_assignments desc, work_order_id, technician_id;
