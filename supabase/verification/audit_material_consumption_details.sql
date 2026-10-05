-- Solo lectura. Detalle de consumo_stock_inconsistente; no corrige saldos.
begin transaction read only;
select
  w.code parte,
  m.id consumo_id,
  mat.code material_codigo,
  mat.description material,
  m.source origen,
  m.created_at creado,
  m.used_quantity cantidad_usada,
  m.stock_validation_status estado_validacion_stock,
  m.stock_deducted_quantity descuento_registrado,
  m.stock_warehouse_id almacen_consumo,
  coalesce(m.stock_deducted_quantity, 0) > 0 and m.stock_validation_status is distinct from 'validated' descuento_sin_validar,
  coalesce(m.stock_deducted_quantity, 0) > 0 and m.stock_warehouse_id is null sin_almacen_canonico,
  movement.consumos cantidad_movimientos_consumo,
  movement.consumido consumo_canonico,
  movement.devuelto devolucion_canonica,
  movement.almacenes almacenes_movimientos,
  movement.claves claves_movimientos,
  balance.quantity saldo_almacen_consumo
from public.work_order_materials m
left join public.work_orders w on w.id = m.work_order_id and w.company_id = m.company_id
left join public.materials mat on mat.id = m.material_id and mat.company_id = m.company_id
left join public.warehouse_stock balance on balance.material_id = m.material_id
  and balance.company_id = m.company_id and balance.warehouse_id = m.stock_warehouse_id
left join lateral (
  select
    count(*) filter (where s.movement_type = 'Consumo en parte') consumos,
    coalesce(sum(s.quantity) filter (where s.movement_type = 'Consumo en parte'), 0) consumido,
    coalesce(sum(s.quantity) filter (where s.movement_type = 'Devolucion'), 0) devuelto,
    array_agg(distinct s.warehouse_id) almacenes,
    array_agg(s.idempotency_key order by s.created_at) claves
  from public.stock_movements s
  where s.company_id = m.company_id and (
    s.work_order_material_id = m.id
    or s.idempotency_key in ('work-order-material:' || m.id, 'work-order-material-return:' || m.id)
  )
) movement on true
where m.deleted_at is null and (
  (m.stock_validation_status is distinct from 'validated' and coalesce(m.stock_deducted_quantity, 0) > 0)
  or (coalesce(m.stock_deducted_quantity, 0) > 0 and m.stock_warehouse_id is null)
)
order by w.code, m.created_at, m.id;
commit;
