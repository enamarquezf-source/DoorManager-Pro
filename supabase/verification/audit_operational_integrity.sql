-- Auditoria de solo lectura. Ejecutar en el SQL Editor tras aplicar 163.
-- No supone que una coincidencia sea un duplicado: devuelve incidencias para revisar.
begin transaction read only;

with
stock_negative as (
  select s.id from public.warehouse_stock s
  join public.materials m on m.id = s.material_id and m.company_id = s.company_id
  where s.quantity < 0 and not coalesce(m.allow_negative_stock, false)
),
stock_key_duplicates as (
  select company_id, idempotency_key from public.stock_movements
  where idempotency_key is not null
  group by company_id, idempotency_key having count(*) > 1
),
usage_inconsistent as (
  select m.id from public.work_order_materials m
  where m.deleted_at is null and (
    (m.stock_validation_status is distinct from 'validated' and coalesce(m.stock_deducted_quantity, 0) > 0)
    or (coalesce(m.stock_deducted_quantity, 0) > 0 and m.stock_warehouse_id is null)
  )
),
planned_link_inconsistent as (
  select d.id from public.work_order_planned_material_decisions d
  left join public.work_order_materials m on m.id = d.work_order_material_id
  where d.deleted_at is null and d.decision = 'utilizado' and (
    m.id is null or m.deleted_at is not null
    or m.company_id is distinct from d.company_id
    or m.work_order_id is distinct from d.work_order_id
  )
),
supplier_totals_inconsistent as (
  select i.id from public.supplier_invoices i
  left join lateral (
    select coalesce(sum(l.net_amount), 0) net, coalesce(sum(l.tax_amount), 0) tax,
           coalesce(sum(l.total_amount), 0) total
    from public.supplier_invoice_lines l where l.supplier_invoice_id = i.id and l.company_id = i.company_id
  ) lines on true
  where i.subtotal <> round(lines.net, 2) or i.tax_amount <> round(lines.tax, 2)
     or i.total_amount <> round(lines.total, 2)
),
supplier_overpaid as (
  select i.id from public.supplier_invoices i
  join public.supplier_invoice_payments p on p.supplier_invoice_id = i.id and p.company_id = i.company_id
  where p.reversed_at is null
  group by i.id, i.total_amount having sum(p.amount) > i.total_amount
),
customer_paid_inconsistent as (
  select i.id from public.invoices i
  left join lateral (
    select coalesce(sum(p.amount), 0) paid from public.invoice_payments p
    where p.invoice_id = i.id and p.company_id = i.company_id and p.reversed_at is null
  ) payments on true
  where i.paid_amount <> round(payments.paid, 2) or payments.paid > i.total_amount
),
alerts_without_target as (
  select a.id from public.alerts a
  where a.deleted_at is null and not exists (
    select 1 from public.alert_recipients r where r.alert_id = a.id and r.company_id = a.company_id
  )
),
recipient_scope_inconsistent as (
  select r.id from public.alert_recipients r
  join public.alerts a on a.id = r.alert_id
  left join public.profiles p on p.id = r.recipient_profile_id
  where a.deleted_at is null and (r.company_id is distinct from a.company_id
    or (r.recipient_profile_id is not null and p.company_id is distinct from r.company_id))
),
active_assignment_hidden as (
  select a.id from public.work_order_assignments a
  join public.work_orders w on w.id = a.work_order_id and w.company_id = a.company_id
  join public.profiles p on p.id = a.technician_id and p.active and p.deleted_at is null
  where a.deleted_at is null and a.status not in ('Finalizado', 'Cancelado')
    and w.deleted_at is null
    and w.status in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Devuelto por SAT')
    and not exists (select 1 from public.v_technician_daily_schedule v where v.assignment_id = a.id)
)
select 'stock_negativo_no_permitido' comprobacion, count(*) incidencias from stock_negative
union all select 'clave_stock_repetida', count(*) from stock_key_duplicates
union all select 'consumo_stock_inconsistente', count(*) from usage_inconsistent
union all select 'material_previsto_vinculo_inconsistente', count(*) from planned_link_inconsistent
union all select 'factura_proveedor_totales_inconsistentes', count(*) from supplier_totals_inconsistent
union all select 'factura_proveedor_pago_excesivo', count(*) from supplier_overpaid
union all select 'factura_cliente_cobro_inconsistente', count(*) from customer_paid_inconsistent
union all select 'aviso_sin_destinatario', count(*) from alerts_without_target
union all select 'destinatario_empresa_inconsistente', count(*) from recipient_scope_inconsistent
union all select 'asignacion_activa_invisible', count(*) from active_assignment_hidden;

commit;
