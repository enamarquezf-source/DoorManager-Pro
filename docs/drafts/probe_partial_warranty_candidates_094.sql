-- 094 probe: lectura exclusiva de garantías candidatas.
select w.id work_order_id,w.code,w.status,w.warranty,w.real_cost_amount cost,w.sale_amount,w.billable,w.economic_status,
  coalesce((select sum(e.total_price) from public.work_order_materials e where e.work_order_id=w.id and e.deleted_at is null and e.source='additional' and e.contributes_to_sale),0)
  + coalesce((select sum(e.total_price) from public.work_order_time_entries e where e.work_order_id=w.id and e.source='additional' and e.contributes_to_sale),0)
  + coalesce((select sum(e.total_price) from public.work_order_cost_entries e where e.work_order_id=w.id and e.deleted_at is null and e.source='additional' and e.contributes_to_sale),0) additional_billable_entries,
  (select count(*) from public.invoice_work_orders l where l.work_order_id=w.id and l.deleted_at is null) invoice_links,
  (select string_agg(distinct i.status,',') from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=w.id and l.deleted_at is null) invoice_statuses
from public.work_orders w where w.deleted_at is null and w.warranty order by w.code;
-- NO APLICAR. REFERENCIA DE BORRADOR. DISENO SUPERADO POR AUDITORIA FUNDACIONAL.
