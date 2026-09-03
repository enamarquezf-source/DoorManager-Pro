select
  msm.id,
  msm.company_id,
  msm.material_id,
  msm.work_order_id,
  msm.work_order_material_id,
  msm.quote_id,
  msm.movement_type,
  msm.quantity,
  msm.previous_stock,
  msm.new_stock,
  msm.unit_cost,
  msm.reason,
  msm.source,
  msm.created_by,
  msm.created_at,
  msm.deleted_at
from public.material_stock_movements msm
order by msm.created_at, msm.id;
