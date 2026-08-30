with material_rows as (
  select
    m.id as material_id,
    m.code as material_code,
    m.stock_quantity as materials_stock_quantity
  from public.materials m
  where m.deleted_at is null
), warehouse_totals as (
  select
    ws.material_id,
    sum(coalesce(ws.quantity, 0)) as warehouse_stock_total,
    count(*)::integer as warehouse_rows
  from public.warehouse_stock ws
  join public.warehouses w on w.id = ws.warehouse_id
  where w.deleted_at is null
  group by ws.material_id
), movement_coverage as (
  select
    sm.material_id,
    count(*)::integer as movement_rows,
    bool_and(sm.previous_stock is not null and sm.new_stock is not null) as movement_chain_complete
  from public.material_stock_movements sm
  where sm.deleted_at is null
  group by sm.material_id
), comparison as (
  select
    coalesce(m.material_id, w.material_id) as material_id,
    m.material_code,
    m.materials_stock_quantity,
    coalesce(w.warehouse_stock_total, 0)::numeric as warehouse_stock_total,
    coalesce(w.warehouse_rows, 0)::integer as warehouse_rows,
    mc.movement_rows,
    mc.movement_chain_complete,
    null::numeric as movement_balance,
    case
      when m.material_id is not null and w.material_id is null then 'MATERIALS_ONLY'
      when m.material_id is null and w.material_id is not null then 'WAREHOUSE_ONLY'
      when m.materials_stock_quantity is null and w.warehouse_stock_total is null then 'NO_STOCK_DATA'
      when m.materials_stock_quantity = w.warehouse_stock_total then 'MATCH'
      when m.material_id is not null and w.material_id is not null then 'MISMATCH'
      else 'REVIEW'
    end as classification
  from material_rows m
  full join warehouse_totals w on w.material_id = m.material_id
  left join movement_coverage mc on mc.material_id = coalesce(m.material_id, w.material_id)
)
select
  material_id,
  material_code,
  materials_stock_quantity,
  warehouse_stock_total,
  warehouse_rows,
  movement_balance,
  classification
from comparison
order by material_code nulls last, material_id;
