-- Read-only diagnostics for the canonical work-order sale model.
-- Run with a company UUID in :company_id.

select code, status, warranty, economic_status, quote_id,
  quoted_sale_amount, time_cost, time_sale, material_cost, material_sale,
  auxiliary_cost, auxiliary_sale, additional_sale_amount, sale_amount,
  real_cost_amount, margin_amount, sale_model_expected
from public.v_work_order_economic_summary
where company_id = :company_id
order by code;

with parts as (
  select company_id, round(sum(sale_amount),2) part_sale, round(sum(real_cost_amount),2) part_cost
  from public.v_work_order_economic_summary
  where company_id = :company_id group by company_id
), orphan_quotes as (
  select q.company_id, round(sum(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0)),2) orphan_quote_sale
  from public.quotes q
  where q.company_id = :company_id and q.deleted_at is null
    and q.status in ('Aceptado','Ejecutado en cliente')
    and not exists (
      select 1 from public.work_orders wo
      where wo.company_id=q.company_id and wo.deleted_at is null
        and (wo.quote_id=q.id or wo.id=q.work_order_id)
    )
  group by q.company_id
), cost_parts as (
  select company_id, round(sum(material_cost),2) material_cost, round(sum(time_cost),2) time_cost,
    round(sum(auxiliary_cost),2) auxiliary_cost
  from public.v_work_order_economic_summary where company_id=:company_id group by company_id
)
select :company_id company_id, coalesce(p.part_sale,0) canonical_part_sale,
  coalesce(o.orphan_quote_sale,0) legacy_orphan_quote_sale,
  round(coalesce(p.part_sale,0)+coalesce(o.orphan_quote_sale,0),2) legacy_dashboard_sale,
  coalesce(p.part_cost,0) canonical_real_cost,
  coalesce(c.material_cost,0) material_cost,coalesce(c.time_cost,0) time_cost,coalesce(c.auxiliary_cost,0) auxiliary_cost,
  round(coalesce(p.part_sale,0)-coalesce(p.part_cost,0),2) canonical_margin
from parts p full join orphan_quotes o on o.company_id=p.company_id
  full join cost_parts c on c.company_id=coalesce(p.company_id,o.company_id);

select 'canonical_part_sale' component, round(sum(sale_amount),2) amount
from public.v_work_order_economic_summary where company_id=:company_id
union all
select 'canonical_real_cost', round(sum(real_cost_amount),2)
from public.v_work_order_economic_summary where company_id=:company_id
union all
select 'legacy_orphan_quote_sale', round(sum(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0)),2)
from public.quotes q where q.company_id=:company_id and q.deleted_at is null
  and q.status in ('Aceptado','Ejecutado en cliente')
  and not exists (select 1 from public.work_orders wo where wo.company_id=q.company_id and wo.deleted_at is null and (wo.quote_id=q.id or wo.id=q.work_order_id));
