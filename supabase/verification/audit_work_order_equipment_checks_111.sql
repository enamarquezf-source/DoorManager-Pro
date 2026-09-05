-- READ-ONLY audit for work-order equipment checks after 111.
-- Returns detail rows followed by one summary row per affected work order.
with associations as (
  select
    woe.work_order_id,
    wo.code as work_order_code,
    wo.type as work_order_type,
    woe.equipment_id,
    e.code as equipment_code,
    concat_ws(' · ', e.brand, e.model, e.internal_location) as equipment_name,
    et.name as equipment_type,
    woe.is_primary,
    woe.check_status as link_check_status,
    woe.check_message as link_check_message
  from public.work_order_equipment woe
  join public.work_orders wo on wo.id = woe.work_order_id
  left join public.equipment e on e.id = woe.equipment_id
  left join public.equipment_types et on et.id = e.equipment_type_id
  where wo.deleted_at is null
    and wo.type in ('Instalacion', 'Mantenimiento')
), association_checks as (
  select associations.*, check_row.active_check_count, check_row.check_id, check_row.template_id, check_row.check_status
  from associations
  left join lateral (
    select c.id as check_id, c.template_id, c.status as check_status, count(*) over () as active_check_count
    from public.checks c
    where c.work_order_id = associations.work_order_id
      and c.equipment_id = associations.equipment_id
      and c.deleted_at is null
    order by c.created_at, c.id
    limit 1
  ) check_row on true
), classified as (
  select
    association_checks.*,
    case
      when active_check_count > 1 then 'DUPLICATE_CHECK'
      when active_check_count = 1 then 'CHECK_CREATED'
      when link_check_status = 'pending_template' then 'PENDING_TEMPLATE'
      when link_check_status = 'not_applicable' and work_order_type not in ('Instalacion', 'Mantenimiento') then 'NOT_APPLICABLE'
      when link_check_status in ('generated', 'not_applicable') then 'MISSING_CHECK'
      else 'OTHER'
    end as final_classification
  from association_checks
), summaries as (
  select
    work_order_id,
    work_order_code,
    work_order_type,
    count(*) as total_associations,
    count(*) filter (where final_classification = 'CHECK_CREATED') as check_created,
    count(*) filter (where final_classification = 'PENDING_TEMPLATE') as pending_template,
    count(*) filter (where final_classification = 'NOT_APPLICABLE') as not_applicable,
    count(*) filter (where final_classification = 'MISSING_CHECK') as missing,
    count(*) filter (where final_classification = 'DUPLICATE_CHECK') as duplicates,
    count(*) filter (where final_classification = 'OTHER') as other
  from classified
  group by work_order_id, work_order_code, work_order_type
)
select
  'ASSOCIATION'::text as row_kind,
  work_order_id,
  work_order_code,
  work_order_type,
  equipment_id,
  equipment_code,
  equipment_name,
  equipment_type,
  is_primary,
  link_check_status,
  link_check_message,
  check_id,
  template_id,
  check_status,
  final_classification,
  null::bigint as total_associations,
  null::bigint as check_created,
  null::bigint as pending_template,
  null::bigint as not_applicable,
  null::bigint as missing,
  null::bigint as duplicates,
  null::bigint as other
from classified
union all
select
  'SUMMARY',
  work_order_id,
  work_order_code,
  work_order_type,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  total_associations,
  check_created,
  pending_template,
  not_applicable,
  missing,
  duplicates,
  other
from summaries
order by work_order_code, row_kind desc, equipment_code nulls last, equipment_id;
