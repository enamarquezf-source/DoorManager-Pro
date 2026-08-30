with active_materials as (
  select m.id as material_id, m.company_id, m.code as material_code, m.stock_quantity
  from public.materials m
  where m.deleted_at is null
), active_warehouses as (
  select w.id as warehouse_id, w.company_id, w.code as warehouse_code, w.name as warehouse_name,
         w.active, to_jsonb(w) as warehouse_record
  from public.warehouses w
  where w.deleted_at is null
), warehouse_stock_rows as (
  select ws.warehouse_id, ws.material_id, ws.quantity, ws.company_id,
         w.warehouse_code, w.warehouse_name, w.active, w.warehouse_record,
         m.material_code, m.stock_quantity
  from public.warehouse_stock ws
  left join active_warehouses w on w.warehouse_id = ws.warehouse_id
  left join active_materials m on m.material_id = ws.material_id
), stock_movement_context as (
  select sm.warehouse_id, sm.material_id,
         count(*)::bigint as movement_count,
         min(sm.created_at) as first_movement_at,
         max(sm.created_at) as last_movement_at,
         string_agg(distinct sm.movement_type, ', ' order by sm.movement_type) as movement_types
  from public.stock_movements sm
  group by sm.warehouse_id, sm.material_id
), material_movement_context as (
  select sm.material_id,
         count(*)::bigint as modern_movement_count,
         min(sm.created_at) as modern_first_movement_at,
         max(sm.created_at) as modern_last_movement_at,
         string_agg(distinct sm.movement_type, ', ' order by sm.movement_type) as modern_movement_types
  from public.material_stock_movements sm
  where sm.deleted_at is null
  group by sm.material_id
), model_counts as (
  select
    (select count(*) from active_materials) as materials_total,
    (select count(*) from active_warehouses) as warehouses_total,
    (select count(*) from active_warehouses where active) as active_warehouses_total,
    (select count(*) from public.warehouse_stock) as warehouse_stock_rows,
    (select count(*) from active_materials m where not exists (select 1 from public.warehouse_stock ws where ws.material_id = m.material_id)) as materials_only,
    (select count(*) from public.warehouse_stock ws where not exists (select 1 from active_materials m where m.material_id = ws.material_id)) as warehouse_only,
    (select count(*) from active_materials m join (select material_id, sum(quantity) as warehouse_total from public.warehouse_stock group by material_id) w on w.material_id = m.material_id where m.stock_quantity = w.warehouse_total) as matches,
    (select count(*) from active_materials m join (select material_id, sum(quantity) as warehouse_total from public.warehouse_stock group by material_id) w on w.material_id = m.material_id where m.stock_quantity is distinct from w.warehouse_total) as mismatches,
    (select count(*) from active_warehouses where lower(code) like '%central%' or lower(name) like '%central%' or lower(code) like '%principal%' or lower(name) like '%principal%') as potentially_primary_warehouses
)
select
  'WAREHOUSES'::text as section,
  w.warehouse_id,
  w.company_id,
  w.warehouse_code,
  w.warehouse_name,
  null::text as warehouse_type,
  w.active as warehouse_active,
  null::boolean as warehouse_default_or_primary,
  null::uuid as material_id,
  null::text as material_code,
  null::numeric as warehouse_quantity,
  null::numeric as legacy_stock_quantity,
  null::numeric as difference,
  null::bigint as movement_count,
  null::timestamptz as first_movement_at,
  null::timestamptz as last_movement_at,
  null::text as movement_types,
  w.warehouse_record as details
from active_warehouses w

union all

select
  'WAREHOUSE_STOCK_EXISTING'::text,
  r.warehouse_id,
  r.company_id,
  r.warehouse_code,
  r.warehouse_name,
  null::text,
  r.active,
  null::boolean,
  r.material_id,
  r.material_code,
  r.quantity,
  r.stock_quantity,
  r.quantity - r.stock_quantity,
  coalesce(sm.movement_count, 0),
  sm.first_movement_at,
  sm.last_movement_at,
  sm.movement_types,
  jsonb_build_object('warehouse_record', r.warehouse_record)
from warehouse_stock_rows r
left join stock_movement_context sm on sm.warehouse_id = r.warehouse_id and sm.material_id = r.material_id

union all

select
  'MISMATCH_CONTEXT'::text,
  r.warehouse_id,
  r.company_id,
  r.warehouse_code,
  r.warehouse_name,
  null::text,
  r.active,
  null::boolean,
  r.material_id,
  r.material_code,
  r.quantity,
  r.stock_quantity,
  r.quantity - r.stock_quantity,
  coalesce(sm.movement_count, 0) + coalesce(mm.modern_movement_count, 0),
  least(sm.first_movement_at, mm.modern_first_movement_at),
  greatest(sm.last_movement_at, mm.modern_last_movement_at),
  concat_ws(', ', nullif(sm.movement_types, ''), nullif('material_stock_movements: ' || mm.modern_movement_types, 'material_stock_movements: ')),
  jsonb_build_object(
    'legacy_stock_movements', jsonb_build_object('count', coalesce(sm.movement_count, 0), 'first', sm.first_movement_at, 'last', sm.last_movement_at, 'types', sm.movement_types),
    'modern_material_stock_movements', jsonb_build_object('count', coalesce(mm.modern_movement_count, 0), 'first', mm.modern_first_movement_at, 'last', mm.modern_last_movement_at, 'types', mm.modern_movement_types),
    'movement_balance', null,
    'movement_balance_reliable', false
  )
from warehouse_stock_rows r
left join stock_movement_context sm on sm.warehouse_id = r.warehouse_id and sm.material_id = r.material_id
left join material_movement_context mm on mm.material_id = r.material_id
where r.material_code in ('MAT-CAB-001', 'MAT-CON-001', 'MAT-FOT-001')

union all

select
  'STOCK_MODEL_COUNTS'::text,
  null::uuid,
  null::uuid,
  null::text,
  null::text,
  null::text,
  null::boolean,
  null::boolean,
  null::uuid,
  null::text,
  null::numeric,
  null::numeric,
  null::numeric,
  null::bigint,
  null::timestamptz,
  null::timestamptz,
  null::text,
  to_jsonb(c)
from model_counts c
order by section, warehouse_code nulls last, material_code nulls last, warehouse_id, material_id;
