-- Read-only probe: specific/consumed materials versus canonical stock and usage history.
with runtime_scope as (
  select public.current_company_id() as company_id
), scoped_materials as (
  select
    m.id as material_id,
    m.company_id,
    m.code,
    m.description,
    m.is_specific,
    m.active,
    m.deleted_at,
    m.stock_controlled,
    m.stock_quantity as legacy_stock,
    m.cost,
    m.price
  from public.materials m
  cross join runtime_scope r
  where (r.company_id is null or m.company_id = r.company_id)
    and m.deleted_at is null
    and m.is_specific = true
), canonical as (
  select
    ws.material_id,
    count(*)::bigint as canonical_rows,
    coalesce(sum(ws.quantity), 0)::numeric as canonical_quantity,
    count(distinct ws.warehouse_id)::bigint as canonical_warehouses
  from public.warehouse_stock ws
  join scoped_materials m on m.material_id = ws.material_id and m.company_id = ws.company_id
  group by ws.material_id
), usage as (
  select
    wom.material_id,
    count(*) filter (where wom.deleted_at is null)::bigint as usage_rows,
    count(distinct wom.work_order_id) filter (where wom.deleted_at is null)::bigint as work_orders,
    coalesce(sum(wom.used_quantity) filter (where wom.deleted_at is null), 0)::numeric as consumed_quantity,
    count(*) filter (where wom.deleted_at is null and wom.stock_validation_status = 'pending')::bigint as pending_stock_usages,
    count(*) filter (where wom.deleted_at is null and wom.stock_validation_status = 'validated')::bigint as validated_stock_usages,
    count(*) filter (where wom.deleted_at is null and wom.stock_warehouse_id is not null)::bigint as warehouse_linked_usages,
    count(*) filter (where wom.deleted_at is null and wom.stock_warehouse_id is null)::bigint as usages_without_warehouse,
    coalesce(sum(wom.total_cost) filter (where wom.deleted_at is null), 0)::numeric as historical_cost,
    count(distinct wo.main_equipment_id) filter (where wom.deleted_at is null and wo.main_equipment_id is not null)::bigint as main_equipment_links,
    count(distinct we.equipment_id) filter (where wom.deleted_at is null and we.equipment_id is not null)::bigint as work_order_equipment_links
  from public.work_order_materials wom
  join scoped_materials m on m.material_id = wom.material_id and m.company_id = wom.company_id
  left join public.work_orders wo on wo.id = wom.work_order_id and wo.company_id = wom.company_id
  left join public.work_order_equipment we on we.work_order_id = wom.work_order_id and we.company_id = wom.company_id
  group by wom.material_id
), movement as (
  select
    sm.material_id,
    count(*)::bigint as stock_movement_rows,
    coalesce(sum(sm.quantity), 0)::numeric as stock_movement_quantity,
    count(distinct sm.warehouse_id)::bigint as stock_movement_warehouses
  from public.stock_movements sm
  join scoped_materials m on m.material_id = sm.material_id and m.company_id = sm.company_id
  group by sm.material_id
)
select
  m.material_id,
  m.company_id,
  m.code,
  m.description,
  m.is_specific,
  m.active,
  m.stock_controlled,
  m.legacy_stock,
  m.cost,
  m.price,
  coalesce(c.canonical_rows, 0)::bigint as canonical_rows,
  coalesce(c.canonical_quantity, 0)::numeric as canonical_quantity,
  coalesce(c.canonical_warehouses, 0)::bigint as canonical_warehouses,
  coalesce(u.usage_rows, 0)::bigint as usage_rows,
  coalesce(u.work_orders, 0)::bigint as work_orders,
  coalesce(u.consumed_quantity, 0)::numeric as consumed_quantity,
  coalesce(u.pending_stock_usages, 0)::bigint as pending_stock_usages,
  coalesce(u.validated_stock_usages, 0)::bigint as validated_stock_usages,
  coalesce(u.warehouse_linked_usages, 0)::bigint as warehouse_linked_usages,
  coalesce(u.usages_without_warehouse, 0)::bigint as usages_without_warehouse,
  coalesce(u.historical_cost, 0)::numeric as historical_cost,
  coalesce(u.main_equipment_links, 0)::bigint as main_equipment_links,
  coalesce(u.work_order_equipment_links, 0)::bigint as work_order_equipment_links,
  coalesce(mv.stock_movement_rows, 0)::bigint as stock_movement_rows,
  coalesce(mv.stock_movement_quantity, 0)::numeric as stock_movement_quantity,
  coalesce(mv.stock_movement_warehouses, 0)::bigint as stock_movement_warehouses,
  case
    when m.legacy_stock is null then 'SPECIFIC_UNKNOWN'
    when coalesce(c.canonical_rows, 0) > 1 or (coalesce(c.canonical_rows, 0) > 0 and coalesce(c.canonical_quantity, 0) <> m.legacy_stock) then 'SPECIFIC_REVIEW'
    when coalesce(c.canonical_rows, 0) = 1 then 'SPECIFIC_CANONICAL_EXISTS'
    when m.legacy_stock > 0 then 'SPECIFIC_POSITIVE_LEGACY_NO_CANONICAL'
    when m.legacy_stock = 0 then 'SPECIFIC_ZERO_LEGACY_NO_CANONICAL'
    else 'SPECIFIC_UNKNOWN'
  end as classification,
  case
    when m.legacy_stock is null then 'UNKNOWN_LEGACY_BALANCE'
    when coalesce(c.canonical_rows, 0) = 0 and m.legacy_stock > 0 then 'CURRENT_BALANCE_CANDIDATE_FOR_OPENING'
    when m.active = false and m.legacy_stock = 0 and coalesce(c.canonical_quantity, 0) = 0 then 'CONSUMED_NO_CURRENT_BALANCE'
    when coalesce(c.canonical_quantity, 0) > 0 or m.legacy_stock > 0 then 'CURRENT_BALANCE_REQUIRES_REVIEW'
    when coalesce(u.usage_rows, 0) > 0 then 'CONSUMPTION_HISTORY_ONLY'
    else 'NO_USAGE_OR_BALANCE'
  end as inventory_interpretation
from scoped_materials m
left join canonical c on c.material_id = m.material_id
left join usage u on u.material_id = m.material_id
left join movement mv on mv.material_id = m.material_id
order by m.code;
