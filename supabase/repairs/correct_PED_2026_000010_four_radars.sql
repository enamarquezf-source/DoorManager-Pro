-- Reparación puntual autorizada: llegaron cuatro Radar Falcón, no uno.
-- Ejecutar TODO en SQL Editor (rol postgres). No es una migración general.
-- PED-2026-000010 / REC-2026-000005 / borrador FPR-2026-000004.
-- Precio conservado: 170 EUR; base 680, IVA 142.80, total 822.80.
-- Conserva la entrada original de una unidad y registra una entrada adicional de tres.
-- Los permisos y las funciones de protección quedan exactamente como estaban.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table public.purchase_orders, public.purchase_order_lines,
  public.purchase_receipts, public.purchase_receipt_lines,
  public.supplier_invoices, public.supplier_invoice_lines,
  public.supplier_invoice_allocations, public.supplier_invoice_payments,
  public.warehouse_stock, public.stock_movements in share row exclusive mode;

do $repair$
declare
  v_order public.purchase_orders;
  v_line public.purchase_order_lines;
  v_receipt public.purchase_receipts;
  v_received public.purchase_receipt_lines;
  v_invoice public.supplier_invoices;
  v_financial public.supplier_invoice_lines;
  v_allocation public.supplier_invoice_allocations;
  v_original public.stock_movements;
  v_correction public.stock_movements;
  v_stock public.warehouse_stock;
  v_order_guard text;
  v_receipt_guard text;
  v_branch text;
  v_patched text;
  v_before jsonb;
  v_after jsonb;
  v_key constant text := 'repair:PED-2026-000010:REC-2026-000005:four-radars';
  v_reason constant text := 'Corrección autorizada por el usuario: llegaron los 4 radares; los documentos registraban 1. Precio conservado: 170 EUR/unidad.';
begin
  if current_user <> 'postgres' then
    raise exception 'Ejecutar esta reparación administrativa con el rol postgres del SQL Editor.';
  end if;

  select * into strict v_order from public.purchase_orders
    where id = 'a05d78ac-9f98-4cba-9f91-dda1404e1a88' and code = 'PED-2026-000010' and status = 'received';
  select * into strict v_line from public.purchase_order_lines where purchase_order_id = v_order.id and company_id = v_order.company_id;
  select * into strict v_receipt from public.purchase_receipts
    where purchase_order_id = v_order.id and company_id = v_order.company_id and code = 'REC-2026-000005' and status = 'confirmed';
  select * into strict v_received from public.purchase_receipt_lines where purchase_receipt_id = v_receipt.id and company_id = v_order.company_id;
  select * into strict v_invoice from public.supplier_invoices
    where id = '5d570b24-6248-4137-bfa4-a4d67aec1abf' and company_id = v_order.company_id and code = 'FPR-2026-000004' and status = 'draft';
  select * into strict v_financial from public.supplier_invoice_lines where supplier_invoice_id = v_invoice.id and company_id = v_order.company_id;
  select * into strict v_allocation from public.supplier_invoice_allocations where supplier_invoice_id = v_invoice.id and company_id = v_order.company_id;
  select * into strict v_original from public.stock_movements
    where purchase_receipt_line_id = v_received.id and company_id = v_order.company_id;
  select * into strict v_stock from public.warehouse_stock
    where warehouse_id = v_receipt.warehouse_id and material_id = v_line.material_id and company_id = v_order.company_id;

  if not exists (select 1 from public.materials where id = v_line.material_id and company_id = v_order.company_id and code = 'MAT-000002')
    or v_receipt.supplier_id is distinct from v_order.supplier_id
    or v_invoice.supplier_id is distinct from v_order.supplier_id
    or v_received.purchase_order_line_id is distinct from v_line.id
    or v_received.material_id is distinct from v_line.material_id
    or v_financial.material_id is distinct from v_line.material_id
    or v_allocation.supplier_invoice_line_id is distinct from v_financial.id
    or v_allocation.purchase_order_id is distinct from v_order.id
    or v_allocation.purchase_order_line_id is distinct from v_line.id
    or v_allocation.purchase_receipt_id is distinct from v_receipt.id
    or v_allocation.purchase_receipt_line_id is distinct from v_received.id
    or v_line.unit_purchase_price is distinct from 170::numeric
    or v_received.actual_unit_cost is distinct from 170::numeric
    or v_financial.unit_price is distinct from 170::numeric
    or v_financial.tax_rate is distinct from 21::numeric
    or v_original.quantity is distinct from 1::numeric
    or v_original.movement_type is distinct from 'Entrada'
    or v_original.warehouse_id is distinct from v_receipt.warehouse_id
    or v_original.material_id is distinct from v_line.material_id
    or v_original.purchase_order_id is distinct from v_order.id
    or v_original.purchase_order_line_id is distinct from v_line.id
    or v_original.purchase_receipt_id is distinct from v_receipt.id
    or v_original.unit_cost is distinct from 170::numeric then
    raise exception 'Los documentos, material, proveedor, precio o movimiento original no coinciden. No se ha modificado nada.';
  end if;
  if exists (select 1 from public.supplier_invoice_payments where supplier_invoice_id = v_invoice.id)
    or exists (select 1 from public.purchase_receipt_lines where purchase_order_line_id = v_line.id and id <> v_received.id)
    or exists (select 1 from public.supplier_invoice_allocations
      where (purchase_order_line_id = v_line.id or purchase_receipt_line_id = v_received.id) and id <> v_allocation.id) then
    raise exception 'Hay pagos, otras recepciones o facturas vinculadas: se necesita revisar el caso antes de corregirlo.';
  end if;

  select * into v_correction from public.stock_movements where company_id = v_order.company_id and idempotency_key = v_key;
  if found then
    if v_line.ordered_quantity = 4 and v_line.subtotal = 680 and v_order.total_amount = 680
      and v_received.received_quantity = 4 and v_received.subtotal = 680
      and v_financial.quantity = 4 and v_financial.net_amount = 680 and v_financial.tax_amount = 142.80 and v_financial.total_amount = 822.80
      and v_invoice.subtotal = 680 and v_invoice.tax_amount = 142.80 and v_invoice.total_amount = 822.80
      and v_allocation.allocated_quantity = 4 and v_allocation.allocated_amount = 680
      and v_correction.quantity = 3 and v_correction.movement_type = 'Entrada'
      and v_correction.material_id = v_line.material_id and v_correction.warehouse_id = v_receipt.warehouse_id
      and v_correction.purchase_order_id = v_order.id and v_correction.purchase_order_line_id = v_line.id
      and v_correction.purchase_receipt_id = v_receipt.id and v_correction.unit_cost = 170
      and v_correction.source = 'purchase_receipt_correction' then
      raise notice 'La corrección ya estaba aplicada. No se duplica el stock.';
      return;
    end if;
    raise exception 'Existe una corrección previa pero los datos no coinciden. No se ha modificado nada.';
  end if;
  if v_line.ordered_quantity is distinct from 1::numeric or v_line.subtotal is distinct from 170::numeric
    or v_order.total_amount is distinct from 170::numeric or v_order.subtotal is distinct from 170::numeric
    or v_received.received_quantity is distinct from 1::numeric or v_received.subtotal is distinct from 170::numeric
    or v_financial.quantity is distinct from 1::numeric or v_financial.net_amount is distinct from 170::numeric
    or v_invoice.total_amount is distinct from 205.70::numeric or v_invoice.tax_amount is distinct from 35.70::numeric
    or v_invoice.subtotal is distinct from 170::numeric
    or v_allocation.allocated_amount is distinct from 170::numeric
    or v_allocation.allocated_quantity is distinct from 1::numeric then
    raise exception 'Las cantidades o importes han cambiado desde la comprobación. No se ha modificado nada.';
  end if;

  v_before := jsonb_build_object('order', to_jsonb(v_order), 'order_line', to_jsonb(v_line),
    'receipt', to_jsonb(v_receipt), 'receipt_line', to_jsonb(v_received),
    'invoice', to_jsonb(v_invoice), 'invoice_line', to_jsonb(v_financial),
    'allocation', to_jsonb(v_allocation), 'stock', to_jsonb(v_stock));

  -- Excepción administrativa transaccional para SOLO estas dos líneas y SOLO 1 -> 4.
  -- No se desactiva ningún trigger. Las demás escrituras conservan todas sus validaciones.
  -- Los bloqueos evitan escrituras concurrentes; al terminar se restauran ambos cuerpos.
  v_order_guard := pg_get_functiondef('public.dmp_purchase_order_line_guard()'::regprocedure);
  v_receipt_guard := pg_get_functiondef('public.dmp_purchase_receipt_line_guard()'::regprocedure);
  v_branch := format($branch$
    if current_user = 'postgres' and tg_op = 'UPDATE'
      and to_jsonb(old) = %L::jsonb
      and new.ordered_quantity = 4 and new.subtotal = 680
      and (to_jsonb(new) - array['ordered_quantity','subtotal','updated_at']) = (to_jsonb(old) - array['ordered_quantity','subtotal','updated_at']) then
      return new;
    end if;
  $branch$, to_jsonb(v_line)::text);
  v_patched := regexp_replace(v_order_guard, '\mbegin\M', E'begin\n' || replace(v_branch, E'\\', E'\\\\'), 'i');
  if v_patched = v_order_guard then raise exception 'No se localizó el cuerpo de protección de pedidos.'; end if;
  execute v_patched;

  v_branch := format($branch$
    if current_user = 'postgres' and tg_op = 'UPDATE'
      and to_jsonb(old) = %L::jsonb
      and new.received_quantity = 4 and new.subtotal = 680
      and (to_jsonb(new) - array['received_quantity','subtotal','updated_at']) = (to_jsonb(old) - array['received_quantity','subtotal','updated_at']) then
      return new;
    end if;
  $branch$, to_jsonb(v_received)::text);
  v_patched := regexp_replace(v_receipt_guard, '\mbegin\M', E'begin\n' || replace(v_branch, E'\\', E'\\\\'), 'i');
  if v_patched = v_receipt_guard then raise exception 'No se localizó el cuerpo de protección de recepciones.'; end if;
  execute v_patched;

  update public.purchase_order_lines set ordered_quantity = 4, subtotal = 680, updated_at = now() where id = v_line.id;
  update public.purchase_receipt_lines set received_quantity = 4, subtotal = 680, updated_at = now() where id = v_received.id;
  execute v_order_guard;
  execute v_receipt_guard;
  if pg_get_functiondef('public.dmp_purchase_order_line_guard()'::regprocedure) <> v_order_guard
    or pg_get_functiondef('public.dmp_purchase_receipt_line_guard()'::regprocedure) <> v_receipt_guard then
    raise exception 'No se han restaurado las protecciones originales.';
  end if;

  -- Estas ediciones del borrador pasan por sus triggers y cálculos normales.
  update public.supplier_invoice_lines set quantity = 4 where id = v_financial.id;
  update public.supplier_invoice_allocations set allocated_quantity = 4, allocated_amount = 680 where id = v_allocation.id;
  update public.warehouse_stock set quantity = quantity + 3, updated_at = now() where id = v_stock.id;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity,
    supplier_id, purchase_order_id, purchase_order_line_id, purchase_receipt_id, unit_cost,
    source, source_reference, notes, idempotency_key)
  values (v_order.company_id, v_receipt.warehouse_id, v_line.material_id, 'Entrada', 3,
    v_order.supplier_id, v_order.id, v_line.id, v_receipt.id, 170,
    'purchase_receipt_correction', v_receipt.supplier_document_reference,
    v_reason || ' Línea de recepción original: ' || v_received.id::text, v_key)
  returning * into v_correction;

  select * into strict v_order from public.purchase_orders where id = v_order.id;
  select * into strict v_invoice from public.supplier_invoices where id = v_invoice.id;
  if v_order.status <> 'received' or v_order.subtotal <> 680 or v_order.total_amount <> 680
    or v_invoice.status <> 'draft' or v_invoice.subtotal <> 680 or v_invoice.tax_amount <> 142.80 or v_invoice.total_amount <> 822.80
    or not exists (select 1 from public.warehouse_stock where id = v_stock.id and quantity = v_stock.quantity + 3 and reserved_quantity = v_stock.reserved_quantity) then
    raise exception 'La comprobación final no coincide. Se revierte toda la operación.';
  end if;
  v_after := jsonb_build_object('reason', v_reason, 'admin_role', current_user,
    'repair_key', v_key, 'order', to_jsonb(v_order), 'invoice', to_jsonb(v_invoice),
    'order_line', (select to_jsonb(l) from public.purchase_order_lines l where l.id = v_line.id),
    'receipt_line', (select to_jsonb(l) from public.purchase_receipt_lines l where l.id = v_received.id),
    'invoice_line', (select to_jsonb(l) from public.supplier_invoice_lines l where l.id = v_financial.id),
    'allocation', (select to_jsonb(a) from public.supplier_invoice_allocations a where a.id = v_allocation.id),
    'stock', (select to_jsonb(s) from public.warehouse_stock s where s.id = v_stock.id),
    'additional_movement', to_jsonb(v_correction));
  insert into public.audit_log(company_id, table_name, record_id, operation, old_data, new_data)
    values (v_order.company_id, 'purchase_orders', v_order.id, 'UPDATE', v_before, v_after);
  raise notice 'Corregido: pedido 4, recepción 4, factura 4; stock +3; base 680, IVA 142.80, total 822.80. Factura en borrador.';
end;
$repair$;
commit;

select o.code as pedido, ol.ordered_quantity as cantidad_pedida,
  r.code as recepcion, rl.received_quantity as cantidad_recibida,
  i.code as factura, il.quantity as cantidad_facturada, i.status as estado_factura,
  i.subtotal as base, i.tax_amount as iva, i.total_amount as total,
  s.quantity as stock_actual
from public.purchase_orders o
join public.purchase_order_lines ol on ol.purchase_order_id = o.id and ol.company_id = o.company_id
join public.purchase_receipts r on r.purchase_order_id = o.id and r.company_id = o.company_id
join public.purchase_receipt_lines rl on rl.purchase_receipt_id = r.id and rl.purchase_order_line_id = ol.id
join public.supplier_invoice_allocations a on a.purchase_receipt_line_id = rl.id and a.company_id = o.company_id
join public.supplier_invoices i on i.id = a.supplier_invoice_id and i.company_id = o.company_id
join public.supplier_invoice_lines il on il.id = a.supplier_invoice_line_id and il.company_id = o.company_id
join public.warehouse_stock s on s.warehouse_id = r.warehouse_id and s.material_id = ol.material_id and s.company_id = o.company_id
where o.id = 'a05d78ac-9f98-4cba-9f91-dda1404e1a88' and i.id = '5d570b24-6248-4137-bfa4-a4d67aec1abf';
