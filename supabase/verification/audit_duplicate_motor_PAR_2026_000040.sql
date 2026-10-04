-- Read-only: identify both usages and their stock/quote links before a correction.
select u.id as consumo_id, u.used_quantity, u.unit_cost, u.source,
 u.stock_validation_status, u.stock_deducted_quantity, u.stock_warehouse_id,
 u.local_change_id, u.created_at, u.deleted_at,
 s.id as movimiento_id, s.movement_type, s.quantity as movimiento_cantidad,
 s.idempotency_key, s.created_at as movimiento_fecha,
 d.quote_line_id, d.decision, d.work_order_material_id as consumo_previsto_vinculado
from public.work_order_materials u
join public.work_orders w on w.id = u.work_order_id and w.company_id = u.company_id
left join public.stock_movements s on s.work_order_material_id = u.id and s.company_id = u.company_id
left join public.work_order_planned_material_decisions d
 on d.work_order_id = u.work_order_id and d.company_id = u.company_id
 and d.work_order_material_id = u.id and d.deleted_at is null
where w.id = 'cf4b646f-4e1d-4297-af21-6b0d6c4339b7'
 and w.code = 'PAR-2026-000040'
 and u.material_id = 'aab321ed-716e-4adb-8509-bb7d17f4f2d7'
order by u.created_at, s.created_at;
