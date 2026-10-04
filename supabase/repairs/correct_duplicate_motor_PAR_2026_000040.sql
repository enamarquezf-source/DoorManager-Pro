-- Correccion puntual del consumo duplicado confirmado por el usuario.
-- Ejecutar completo en SQL Editor, rol postgres. Repetible sin devolver stock dos veces.
-- Conserva ambos movimientos originales y registra una devolucion de 3 unidades.
-- No modifica facturas, cobros, presupuesto, venta aprobada ni estado del parte.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';
lock table public.work_orders, public.work_order_materials,
 public.work_order_planned_material_decisions, public.work_order_time_entries,
 public.work_order_cost_entries, public.warehouse_stock, public.stock_movements
 in share row exclusive mode;

do $repair$
declare
 w public.work_orders;
 duplicate_usage public.work_order_materials;
 valid_usage public.work_order_materials;
 original public.stock_movements;
 canonical_movement public.stock_movements;
 stock_before numeric;
 stock_after numeric;
 cost_after numeric;
 before_data jsonb;
 reason constant text := 'Correccion de consumo duplicado de 3 motores en PAR-2026-000040: se conserva el consumo vinculado al presupuesto y se devuelve el descuento duplicado.';
begin
 if current_user <> 'postgres' then
  raise exception 'Ejecutar con el rol postgres del SQL Editor.';
 end if;
 select * into strict w from public.work_orders
  where id = 'cf4b646f-4e1d-4297-af21-6b0d6c4339b7' and code = 'PAR-2026-000040' and deleted_at is null;
 select * into strict duplicate_usage from public.work_order_materials
  where id = '068d1809-a6ec-4d11-b354-215a21a72d78' and work_order_id = w.id and company_id = w.company_id;
 select * into strict valid_usage from public.work_order_materials
  where id = '2d788f33-0a11-4233-abdc-7ec6398483a7' and work_order_id = w.id and company_id = w.company_id and deleted_at is null;
 select * into strict original from public.stock_movements
  where id = '74bd37cc-3d4f-4dd4-b58c-016913ed62a1' and company_id = w.company_id;
 select * into strict canonical_movement from public.stock_movements
  where id = 'c3f84a1a-f759-4dbd-ad09-df94a6748d54' and company_id = w.company_id;
 if duplicate_usage.material_id is distinct from 'aab321ed-716e-4adb-8509-bb7d17f4f2d7'::uuid
  or valid_usage.material_id is distinct from duplicate_usage.material_id
  or duplicate_usage.used_quantity is distinct from 3::numeric
  or valid_usage.used_quantity is distinct from 3::numeric
  or duplicate_usage.unit_cost is distinct from 210::numeric
  or valid_usage.unit_cost is distinct from 210::numeric
  or duplicate_usage.source is distinct from 'quote'
  or valid_usage.source is distinct from 'quote'
  or duplicate_usage.stock_validation_status is distinct from 'validated'
  or valid_usage.stock_validation_status is distinct from 'validated'
  or duplicate_usage.stock_warehouse_id is distinct from '94000000-0000-0000-0000-000000000001'::uuid
  or valid_usage.stock_warehouse_id is distinct from duplicate_usage.stock_warehouse_id
  or original.work_order_material_id is distinct from duplicate_usage.id
  or canonical_movement.work_order_material_id is distinct from valid_usage.id
  or original.work_order_id is distinct from w.id
  or canonical_movement.work_order_id is distinct from w.id
  or original.material_id is distinct from duplicate_usage.material_id
  or canonical_movement.material_id is distinct from duplicate_usage.material_id
  or original.warehouse_id is distinct from duplicate_usage.stock_warehouse_id
  or canonical_movement.warehouse_id is distinct from duplicate_usage.stock_warehouse_id
  or original.movement_type is distinct from 'Consumo en parte'
  or canonical_movement.movement_type is distinct from 'Consumo en parte'
  or original.quantity is distinct from 3::numeric
  or canonical_movement.quantity is distinct from 3::numeric
  or valid_usage.stock_deducted_quantity is distinct from 3::numeric then
  raise exception 'Los registros ya no coinciden con la duplicidad diagnosticada. No se ha modificado nada.';
 end if;
 if not exists (select 1 from public.work_order_planned_material_decisions d
  join public.quote_lines ql on ql.id = d.quote_line_id and ql.company_id = d.company_id
  where d.company_id = w.company_id and d.work_order_id = w.id and d.deleted_at is null
   and d.quote_line_id = '1e93425d-0e70-44eb-9e43-e334d89ac1d6'
   and d.work_order_material_id = valid_usage.id and d.decision = 'utilizado'
   and ql.quote_id = w.quote_id and ql.material_id = valid_usage.material_id)
  or exists (select 1 from public.work_order_planned_material_decisions
   where work_order_material_id = duplicate_usage.id and deleted_at is null) then
  raise exception 'El vinculo al presupuesto ha cambiado. No se ha modificado nada.';
 end if;
 if duplicate_usage.deleted_at is not null then
  if duplicate_usage.stock_deducted_quantity = 0 and exists (
   select 1 from public.stock_movements where company_id = w.company_id
    and idempotency_key = 'work-order-material-return:' || duplicate_usage.id
    and work_order_material_id = duplicate_usage.id and material_id = duplicate_usage.material_id
    and warehouse_id = duplicate_usage.stock_warehouse_id and movement_type = 'Devolucion' and quantity = 3
  ) then
   raise notice 'La duplicidad ya esta corregida. No se repite la devolucion.';
   return;
  end if;
  raise exception 'Consumo archivado sin la devolucion esperada; requiere revision.';
 end if;
 if duplicate_usage.stock_deducted_quantity is distinct from 3::numeric
  or exists (select 1 from public.stock_movements where company_id = w.company_id
   and idempotency_key = 'work-order-material-return:' || duplicate_usage.id) then
  raise exception 'El stock del consumo duplicado ha cambiado. No se ha modificado nada.';
 end if;
 select quantity into strict stock_before from public.warehouse_stock
  where company_id = w.company_id and warehouse_id = duplicate_usage.stock_warehouse_id
   and material_id = duplicate_usage.material_id;
 before_data := jsonb_build_object('work_order',to_jsonb(w),'duplicate_usage',to_jsonb(duplicate_usage),
  'valid_usage',to_jsonb(valid_usage),'original_movement',to_jsonb(original),'warehouse_stock',stock_before);
 perform public.dmp_refund_work_order_material_stock(duplicate_usage.id, original.created_by, reason);
 update public.work_order_materials set deleted_at = now(), updated_at = now()
  where id = duplicate_usage.id and company_id = w.company_id and work_order_id = w.id;
 select round(coalesce(sum(x.total_cost),0),2) into cost_after from (
  select total_cost from public.work_order_materials where company_id = w.company_id and work_order_id = w.id and deleted_at is null
  union all select total_cost from public.work_order_time_entries where company_id = w.company_id and work_order_id = w.id
  union all select total_cost from public.work_order_cost_entries where company_id = w.company_id and work_order_id = w.id and deleted_at is null
 ) x;
 update public.work_orders set real_cost_amount = cost_after,
  margin_amount = round(coalesce(sale_amount,0) - cost_after,2),
  estimated_margin_amount = round(coalesce(estimated_sale_amount,sale_amount,0) - cost_after,2), updated_at = now()
  where id = w.id and company_id = w.company_id;
 select quantity into strict stock_after from public.warehouse_stock
  where company_id = w.company_id and warehouse_id = duplicate_usage.stock_warehouse_id
   and material_id = duplicate_usage.material_id;
 if stock_after <> stock_before + 3 or cost_after <> round(w.real_cost_amount - 630,2) then
  raise exception 'La comprobacion de stock o coste no coincide. Se revierte toda la correccion.';
 end if;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(w.company_id,'work_order_materials',duplicate_usage.id,'SOFT_DELETE',original.created_by,
  before_data,jsonb_build_object('repair','duplicate_motor_PAR_2026_000040','reason',reason,'executed_by_database_role',current_user,
   'work_order',(select to_jsonb(f) from public.work_orders f where f.id=w.id),
   'duplicate_usage',(select to_jsonb(u) from public.work_order_materials u where u.id=duplicate_usage.id),
   'warehouse_stock',stock_after));
end;
$repair$;
commit;

select w.code as parte, w.real_cost_amount as coste_real, w.sale_amount as venta_aprobada,
 w.margin_amount as margen, s.quantity as stock_actual,
 u.deleted_at as duplicado_anulado, u.stock_deducted_quantity as descuento_duplicado_restante
from public.work_orders w
join public.work_order_materials u on u.work_order_id = w.id and u.company_id = w.company_id
join public.warehouse_stock s on s.company_id = w.company_id and s.material_id = u.material_id and s.warehouse_id = u.stock_warehouse_id
where w.id = 'cf4b646f-4e1d-4297-af21-6b0d6c4339b7'
 and u.id = '068d1809-a6ec-4d11-b354-215a21a72d78';
