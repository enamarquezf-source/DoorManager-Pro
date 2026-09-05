-- READ-ONLY historical audit for 112. Do not run this file as a migration.
select
  wo.code as work_order_code,
  wo.type as work_order_type,
  wo.created_at as work_order_created_at,
  e.code as equipment_code,
  et.name as equipment_type,
  woe.check_status as link_check_status,
  (select count(*) from public.checks c where c.work_order_id = wo.id and c.equipment_id = e.id and c.deleted_at is null) > 0 as active_check_exists,
  public.dmp_resolve_check_template(wo.company_id, e.equipment_type_id) as resolved_template_id,
  case
    when (select count(*) from public.checks c where c.work_order_id = wo.id and c.equipment_id = e.id and c.deleted_at is null) > 1 then 'DUPLICATE_CHECK'
    when (select count(*) from public.checks c where c.work_order_id = wo.id and c.equipment_id = e.id and c.deleted_at is null) = 1 then 'CHECK_PRESENT'
    when woe.check_status = 'pending_template' then 'PENDING_TEMPLATE'
    when wo.type = 'Preventivo' and woe.check_status = 'not_applicable' then 'HISTORICAL_PREVENTIVE_NOT_APPLICABLE'
    when coalesce(woe.check_status, '') in ('generated', 'not_applicable') then 'HISTORICAL_MISSING_CHECK'
    else 'OTHER'
  end as historical_classification
from public.work_order_equipment woe
join public.work_orders wo on wo.id = woe.work_order_id
join public.equipment e on e.id = woe.equipment_id
left join public.equipment_types et on et.id = e.equipment_type_id
where wo.deleted_at is null
order by wo.created_at, wo.code, e.code;
