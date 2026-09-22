-- DoorManager Pro - expose work-order economic status in the full-detail view.
-- Contract-only change: preserve the existing 24 columns and append one column.

begin;

create or replace view public.v_work_order_full_detail as
select wo.id, wo.company_id, wo.code, wo.title, wo.description, wo.type, wo.priority, wo.status, wo.origin,
       wo.scheduled_date, wo.scheduled_time, wo.diagnosis, wo.work_performed, wo.result,
       ca.code as case_code, c.code as client_code, c.legal_name as client_name, s.code as site_code, s.name as site_name,
       e.code as equipment_code, et.name as equipment_type,
       tech.first_name || ' ' || tech.last_name as main_technician_name,
       creator.first_name || ' ' || creator.last_name as created_by_name,
       wo.deleted_at as deleted_at,
       wo.economic_status as economic_status
from public.work_orders wo
left join public.cases ca on ca.id = wo.case_id
join public.clients c on c.id = wo.client_id
join public.sites s on s.id = wo.site_id
left join public.equipment e on e.id = wo.main_equipment_id
left join public.equipment_types et on et.id = e.equipment_type_id
left join public.profiles tech on tech.id = wo.main_technician_id
left join public.profiles creator on creator.id = wo.created_by;

commit;
