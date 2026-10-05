-- Permite que el técnico vea en su lista los checks pendientes de partes
-- históricos que siguen asignados a su perfil. No cambia estados ni permisos
-- de edición: la consulta del cliente continúa filtrando por technician_id.
begin;

create or replace view public.v_pending_checks
with (security_invoker = true) as
select ch.*, e.code as equipment_code, wo.code as work_order_code
from public.checks ch
join public.equipment e on e.id = ch.equipment_id
left join public.work_orders wo on wo.id = ch.work_order_id
where ch.deleted_at is null
  and ch.status in ('Por realizar','En curso')
  and (wo.id is null or wo.deleted_at is null);

notify pgrst, 'reload schema';
commit;
