select
  msm.id as movement_id,
  msm.created_at,
  msm.movement_type,
  msm.source,
  msm.quantity,
  msm.unit_cost,
  m.code as material_code,
  m.description as material_description,
  wo.code as work_order_code,
  case
    when wom.id is null then null
    else concat(wom.id, ' / used_quantity=', wom.used_quantity, ' / unit=', wom.unit)
  end as work_order_material,
  q.code as quote_code,
  trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as created_by,
  msm.reason,
  msm.previous_stock,
  msm.new_stock,
  msm.deleted_at
from public.material_stock_movements msm
left join public.materials m on m.id = msm.material_id
left join public.work_orders wo on wo.id = msm.work_order_id
left join public.work_order_materials wom on wom.id = msm.work_order_material_id
left join public.quotes q on q.id = msm.quote_id
left join public.profiles p on p.id = msm.created_by
order by msm.created_at, msm.id;
