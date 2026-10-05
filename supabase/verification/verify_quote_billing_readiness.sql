-- Diagnóstico de presupuestos con parte asociado que todavía no puede facturarse.
-- Solo lectura. Incluye el presupuesto abierto y cubre las dos relaciones históricas.
with candidates as (
  select
    q.id as quote_id,
    q.code as quote_code,
    q.status as quote_status,
    q.taxable_base,
    q.total_amount as quote_total,
    w.id as work_order_id,
    w.code as work_order_code,
    w.status as work_order_status,
    w.economic_status,
    w.economic_review_status,
    w.sale_amount,
    w.billable,
    w.office_validation_status,
    w.sat_review_status,
    w.sat_review_destination,
    w.commercial_review_status,
    count(distinct i.id) filter (where i.status <> 'cancelada') as facturas_activas,
    string_agg(distinct i.code, ', ' order by i.code) filter (where i.status <> 'cancelada') as codigos_factura,
    w.deleted_at
  from public.quotes q
  join public.work_orders w on (w.quote_id = q.id or w.id = q.work_order_id) and w.deleted_at is null
  left join public.invoice_work_orders iw on iw.work_order_id = w.id and iw.deleted_at is null
  left join public.invoices i on i.id = iw.invoice_id
  where q.deleted_at is null
    -- Descomenta la siguiente línea si quieres revisar solo el presupuesto abierto.
    -- and q.id = 'aa9ae7d3-a87d-41ce-860e-cd63209b5342'
  group by q.id,q.code,q.status,q.taxable_base,q.total_amount,w.id,w.code,w.status,w.economic_status,w.economic_review_status,w.sale_amount,w.billable,w.office_validation_status,w.sat_review_status,w.sat_review_destination,w.commercial_review_status,w.deleted_at
), blockers as (
  select c.*,
    array_remove(array[
      case when c.quote_status not in ('Aceptado','Ejecutado en cliente') then 'El presupuesto no está aceptado.' end,
      case when c.work_order_status in ('Cerrado','Cancelado') then 'El parte está cerrado o cancelado.' end,
      case when coalesce(c.billable, true) = false then 'El parte está marcado como no facturable.' end,
      case when coalesce(c.sale_amount, 0) <= 0 then 'El parte no tiene una venta aprobada mayor que cero.' end,
      case when c.economic_review_status = 'approved' and c.economic_status in ('pendiente_facturar','pendiente_validacion') and c.sat_review_status = 'approved' and (c.sat_review_destination = 'facturacion' or (c.sat_review_destination = 'comercial' and c.commercial_review_status = 'approved')) then null
           when c.economic_review_status = 'not_started' and c.economic_status = 'pendiente_facturar' and c.office_validation_status = 'validated' then null
           when c.economic_review_status = 'approved' then 'Falta completar la revisión SAT/Comercial y enviarla a Facturación.'
           else 'La revisión económica todavía no está aprobada.' end
    ], null) as bloqueos
  from candidates c
)
select *
from blockers
where cardinality(bloqueos) > 0
order by (quote_id = 'aa9ae7d3-a87d-41ce-860e-cd63209b5342') desc, quote_code, work_order_code;
