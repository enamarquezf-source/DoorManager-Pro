-- 092 probe. Read-only classification of current invoices.
select
  i.id as invoice_id,
  i.code,
  i.status,
  i.code as invoice_number,
  (i.fiscal_snapshot is not null) as fiscal_snapshot_present,
  count(distinct p.id)::bigint as payment_count,
  count(distinct l.id)::bigint as work_order_count,
  count(distinct l.id)::bigint as line_count,
  case
    when i.status = 'borrador' and i.code is null and i.fiscal_snapshot is null and count(distinct p.id) = 0 then true
    else false
  end as eligible_for_delete_092,
  case
    when i.status = 'borrador' and count(distinct p.id) > 0 then 'draft_with_payment_blocked'
    when i.status = 'borrador' and i.fiscal_snapshot is not null then 'draft_with_fiscal_snapshot_blocked'
    when i.status = 'borrador' and i.code is not null then 'draft_with_number_blocked'
    when i.status = 'borrador' then 'deletable_draft'
    when i.status = 'emitida' then 'issued_not_deletable'
    when i.status = 'parcialmente_cobrada' then 'partially_paid_not_deletable'
    when i.status = 'cobrada' then 'paid_not_deletable'
    when i.status = 'cancelada' then 'cancelled_not_deletable'
    else 'unknown'
  end as classification
from public.invoices i
left join public.invoice_payments p on p.invoice_id = i.id
left join public.invoice_work_orders l on l.invoice_id = i.id
group by i.id, i.code, i.status, i.fiscal_snapshot
order by i.created_at desc, i.id;
