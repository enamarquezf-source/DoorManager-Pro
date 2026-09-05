-- READ-ONLY audit for quote 8a4ceb5e-90bd-4b7e-a44f-c2e1d1957276 and PAR-2026-000033.
-- quote_lines has no equipment_type/equipment relation; do not infer one from text.
-- Output contract (29 columns): row_kind, quote fields (8), line fields (9),
-- work-order fields (4), equipment fields (7).

with target_quote as (
  select q.id, q.code, q.status, q.work_order_id, q.equipment_id, q.quote_type, q.created_at, q.updated_at
  from public.quotes q
  where q.id = '8a4ceb5e-90bd-4b7e-a44f-c2e1d1957276'::uuid
), target_work_order as (
  select wo.id, wo.code, wo.type, wo.main_equipment_id, wo.quote_id, wo.created_at, wo.updated_at
  from public.work_orders wo
  join target_quote q on q.id = wo.quote_id or q.work_order_id = wo.id
  where wo.code = 'PAR-2026-000033' and wo.deleted_at is null
), associated as (
  select wo.id as work_order_id, woe.equipment_id, woe.is_primary, woe.created_at,
         e.code as equipment_code, concat_ws(' · ', e.brand, e.model, e.internal_location) as equipment_name,
         et.name as equipment_type
  from target_work_order wo
  join public.work_order_equipment woe on woe.work_order_id = wo.id
  join public.equipment e on e.id = woe.equipment_id
  left join public.equipment_types et on et.id = e.equipment_type_id
), type_summary as (
  select work_order_id, equipment_type, count(*)::numeric as equipment_count
  from associated
  group by work_order_id, equipment_type
), combined as (
  select
    'QUOTE'::text as row_kind,
    q.id as quote_id, q.code as quote_code, q.status as quote_status, q.work_order_id as quote_work_order_id, q.equipment_id as quote_equipment_id, q.quote_type, q.created_at as quote_created_at, q.updated_at as quote_updated_at,
    null::uuid as quote_line_id, null::integer as quote_line_position, null::text as quote_line_type, null::text as quote_line_description, null::numeric as quote_line_quantity, null::text as quote_line_unit, null::uuid as quote_line_material_id, null::uuid as quote_line_concept_id, null::uuid as quote_line_rate_id,
    wo.id as work_order_id, wo.code as work_order_code, wo.type as work_order_type, wo.main_equipment_id,
    null::uuid as equipment_id, null::text as equipment_code, null::text as equipment_name, null::text as equipment_type, null::boolean as is_primary, null::timestamptz as equipment_created_at, 'QUOTE_LINES_HAVE_NO_EQUIPMENT_TYPE_COLUMN'::text as equipment_type_source
  from target_quote q left join target_work_order wo on true
  union all
  select
    'QUOTE_LINE', q.id, q.code, q.status, q.work_order_id, q.equipment_id, q.quote_type, q.created_at, q.updated_at,
    l.id, l.position, l.line_type, l.description, l.quantity, l.unit, l.material_id, l.concept_id, l.quote_rate_id,
    null::uuid, null::text, null::text, null::uuid,
    null::uuid, null::text, null::text, null::text, null::boolean, null::timestamptz, null::text
  from target_quote q join public.quote_lines l on l.quote_id = q.id and l.deleted_at is null
  union all
  select
    'EQUIPMENT', null::uuid, null::text, null::text, null::uuid, null::uuid, null::text, null::timestamptz, null::timestamptz,
    null::uuid, null::integer, null::text, null::text, null::numeric, null::text, null::uuid, null::uuid, null::uuid,
    wo.id, wo.code, wo.type, wo.main_equipment_id,
    a.equipment_id, a.equipment_code, a.equipment_name, a.equipment_type, a.is_primary, a.created_at, null::text
  from target_work_order wo join associated a on a.work_order_id = wo.id
  union all
  select
    'EQUIPMENT_TYPE_SUMMARY', null::uuid, null::text, null::text, null::uuid, null::uuid, null::text, null::timestamptz, null::timestamptz,
    null::uuid, null::integer, null::text, null::text, types.equipment_count, null::text, null::uuid, null::uuid, null::uuid,
    wo.id, wo.code, wo.type, wo.main_equipment_id,
    null::uuid, null::text, null::text, types.equipment_type, null::boolean, null::timestamptz, null::text
  from type_summary types join target_work_order wo on wo.id = types.work_order_id
)
select c.*
from combined c
order by case c.row_kind when 'QUOTE' then 1 when 'QUOTE_LINE' then 2 when 'EQUIPMENT' then 3 when 'EQUIPMENT_TYPE_SUMMARY' then 4 else 5 end,
         c.quote_line_id nulls first, c.equipment_type nulls first, c.equipment_code nulls first, c.equipment_id nulls first;
