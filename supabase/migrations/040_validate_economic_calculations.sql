-- DoorManager Pro - capa economica estable basada en el esquema real.
-- Idempotente. No desactiva RLS, no usa service_role y las vistas son security_invoker.

begin;

create or replace view public.v_work_order_economic_summary
with (security_invoker = true)
as
with material_summary as (
  select
    company_id,
    work_order_id,
    round(coalesce(sum(coalesce(used_quantity, 0) * coalesce(unit_cost, unit_price, 0)), 0), 2) as material_cost,
    round(coalesce(sum(coalesce(used_quantity, 0) * coalesce(unit_price, 0)), 0), 2) as material_sale
  from public.work_order_materials
  where deleted_at is null
  group by company_id, work_order_id
), time_summary as (
  select
    company_id,
    work_order_id,
    round(coalesce(sum(coalesce(duration_minutes, 0)::numeric / 60 * coalesce(hourly_cost, 0)), 0), 2) as time_cost,
    round(coalesce(sum(coalesce(duration_minutes, 0)::numeric / 60 * coalesce(hourly_price, 0)), 0), 2) as time_sale
  from public.work_order_time_entries
  group by company_id, work_order_id
), cost_summary as (
  select
    company_id,
    work_order_id,
    round(coalesce(sum(coalesce(quantity, 0) * coalesce(unit_cost, 0)), 0), 2) as auxiliary_cost,
    round(coalesce(sum(coalesce(quantity, 0) * coalesce(unit_price, 0)), 0), 2) as auxiliary_sale,
    round(coalesce(sum(coalesce(quantity, 0) * coalesce(unit_cost, 0)) filter (where cost_type = 'desplazamiento'), 0), 2) as travel_cost,
    round(coalesce(sum(coalesce(quantity, 0) * coalesce(unit_cost, 0)) filter (where cost_type = 'taller_movil'), 0), 2) as mobile_workshop_cost,
    round(coalesce(sum(coalesce(quantity, 0) * coalesce(unit_cost, 0)) filter (where cost_type = 'plataforma_elevadora'), 0), 2) as platform_cost,
    round(coalesce(sum(coalesce(quantity, 0) * coalesce(unit_cost, 0)) filter (where cost_type = 'coste_externo'), 0), 2) as external_cost
  from public.work_order_cost_entries
  where deleted_at is null
  group by company_id, work_order_id
), accepted_quote_summary as (
  select distinct on (company_id, work_order_id)
    company_id,
    work_order_id,
    coalesce(taxable_base, subtotal_sale, subtotal, 0) as quote_sale_amount
  from public.quotes
  where deleted_at is null
    and work_order_id is not null
    and status in ('Aceptado','Ejecutado en cliente')
  order by company_id, work_order_id, issue_date desc nulls last, created_at desc nulls last, id desc
), work_order_base as (
  select
    wo.id,
    wo.company_id,
    wo.code,
    wo.title,
    wo.status,
    wo.type,
    wo.scheduled_date,
    wo.client_id,
    c.legal_name as client_name,
    wo.site_id,
    s.name as site_name,
    wo.main_equipment_id,
    e.code as equipment_code,
    wo.economic_status,
    wo.billable,
    wo.warranty,
    coalesce(mat.material_cost, 0) as material_cost,
    coalesce(tim.time_cost, 0) as time_cost,
    coalesce(aux.auxiliary_cost, 0) as auxiliary_cost,
    coalesce(aux.travel_cost, 0) as travel_cost,
    coalesce(aux.mobile_workshop_cost, 0) as mobile_workshop_cost,
    coalesce(aux.platform_cost, 0) as platform_cost,
    coalesce(aux.external_cost, 0) as external_cost,
    round(coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0), 2) as real_cost_amount,
    case
      when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then 0
      else round(coalesce(nullif(wo.estimated_sale_amount, 0), q.quote_sale_amount, coalesce(mat.material_sale, 0) + coalesce(tim.time_sale, 0) + coalesce(aux.auxiliary_sale, 0), 0), 2)
    end as sale_amount,
    wo.invoiced_amount,
    wo.paid_amount
  from public.work_orders wo
  left join public.clients c on c.id = wo.client_id and c.company_id = wo.company_id
  left join public.sites s on s.id = wo.site_id and s.company_id = wo.company_id
  left join public.equipment e on e.id = wo.main_equipment_id and e.company_id = wo.company_id
  left join material_summary mat on mat.work_order_id = wo.id and mat.company_id = wo.company_id
  left join time_summary tim on tim.work_order_id = wo.id and tim.company_id = wo.company_id
  left join cost_summary aux on aux.work_order_id = wo.id and aux.company_id = wo.company_id
  left join accepted_quote_summary q on q.work_order_id = wo.id and q.company_id = wo.company_id
  where wo.deleted_at is null
)
select
  id,
  company_id,
  code,
  title,
  status,
  type,
  scheduled_date,
  client_id,
  client_name,
  site_id,
  site_name,
  main_equipment_id,
  equipment_code,
  economic_status,
  billable,
  warranty,
  material_cost,
  time_cost,
  auxiliary_cost,
  travel_cost,
  mobile_workshop_cost,
  platform_cost,
  external_cost,
  real_cost_amount,
  sale_amount as estimated_sale_amount,
  round(sale_amount - real_cost_amount, 2) as estimated_margin_amount,
  invoiced_amount,
  paid_amount,
  sale_amount,
  round(sale_amount - real_cost_amount, 2) as margin_amount,
  case when sale_amount > 0 then round((sale_amount - real_cost_amount) / sale_amount * 100, 2) else null end as margin_percentage,
  real_cost_amount as real_cost
from work_order_base;

create or replace view public.v_client_economic_summary
with (security_invoker = true)
as
with client_work_order_summary as (
  select
    company_id,
    client_id,
    round(coalesce(sum(real_cost_amount), 0), 2) as real_cost_amount,
    round(coalesce(sum(sale_amount), 0), 2) as work_order_sale_amount,
    round(coalesce(sum(real_cost_amount) filter (where warranty or economic_status = 'garantia'), 0), 2) as warranty_cost,
    count(*) filter (where warranty or economic_status = 'garantia') as warranty_work_orders,
    count(*) filter (where billable and economic_status in ('facturable','pendiente_facturar')) as billable_work_orders,
    count(*) filter (where economic_status = 'pendiente_facturar' or (status in ('Finalizado tecnicamente','Enviado','Cerrado') and coalesce(invoiced_amount, 0) = 0 and not warranty)) as pending_invoice_work_orders
  from public.v_work_order_economic_summary
  where client_id is not null
  group by company_id, client_id
), client_quote_summary as (
  select
    company_id,
    client_id,
    round(coalesce(sum(coalesce(taxable_base, subtotal_sale, subtotal, 0)), 0), 2) as sale_amount,
    round(coalesce(sum(coalesce(tax_amount, 0)), 0), 2) as tax_amount,
    round(coalesce(sum(coalesce(total_amount, total, 0)), 0), 2) as total_amount,
    count(*) filter (where status = 'Aceptado') as accepted_quotes,
    count(*) filter (where status = 'Ejecutado en cliente') as executed_quotes
  from public.quotes
  where deleted_at is null
    and client_id is not null
    and status in ('Aceptado','Ejecutado en cliente')
  group by company_id, client_id
)
select
  c.id,
  c.company_id,
  c.code,
  c.legal_name,
  coalesce(w.real_cost_amount, 0) as real_cost_amount,
  coalesce(q.sale_amount, w.work_order_sale_amount, 0) as estimated_sale_amount,
  round(coalesce(q.sale_amount, w.work_order_sale_amount, 0) - coalesce(w.real_cost_amount, 0), 2) as estimated_margin_amount,
  coalesce(w.warranty_work_orders, 0) as warranty_work_orders,
  coalesce(w.billable_work_orders, 0) as billable_work_orders,
  coalesce(w.pending_invoice_work_orders, 0) as pending_invoice_work_orders,
  coalesce(q.sale_amount, 0) as quote_sale_amount,
  coalesce(q.total_amount, 0) as quote_total_amount,
  coalesce(q.accepted_quotes, 0) as accepted_quotes,
  coalesce(q.executed_quotes, 0) as executed_quotes,
  coalesce(q.sale_amount, w.work_order_sale_amount, 0) as sale_amount,
  round(coalesce(q.sale_amount, w.work_order_sale_amount, 0) - coalesce(w.real_cost_amount, 0), 2) as margin_amount,
  case when coalesce(q.sale_amount, w.work_order_sale_amount, 0) > 0 then round((coalesce(q.sale_amount, w.work_order_sale_amount, 0) - coalesce(w.real_cost_amount, 0)) / coalesce(q.sale_amount, w.work_order_sale_amount, 0) * 100, 2) else null end as margin_percentage,
  coalesce(w.warranty_cost, 0) as warranty_cost,
  coalesce(q.tax_amount, 0) as quote_tax_amount,
  coalesce(w.real_cost_amount, 0) as real_cost
from public.clients c
left join client_work_order_summary w on w.client_id = c.id and w.company_id = c.company_id
left join client_quote_summary q on q.client_id = c.id and q.company_id = c.company_id
where c.deleted_at is null;

create or replace view public.v_management_metrics
with (security_invoker = true)
as
with client_counts as (
  select company_id, count(*) as clients
  from public.clients
  where deleted_at is null
  group by company_id
), equipment_counts as (
  select company_id, count(*) as equipment
  from public.equipment
  where deleted_at is null
  group by company_id
), work_order_summary as (
  select
    company_id,
    count(*) as work_orders,
    count(*) filter (where scheduled_date >= date_trunc('month', current_date)::date) as work_orders_this_month,
    count(*) filter (where status in ('Finalizado tecnicamente','Enviado','Cerrado')) as finished_work_orders,
    count(*) filter (where economic_status = 'pendiente_facturar' or (status in ('Finalizado tecnicamente','Enviado','Cerrado') and coalesce(invoiced_amount, 0) = 0 and not warranty)) as pending_invoice_work_orders,
    round(coalesce(sum(real_cost_amount) filter (where warranty or economic_status = 'garantia'), 0), 2) as warranty_cost,
    round(coalesce(sum(real_cost_amount), 0), 2) as real_cost
  from public.v_work_order_economic_summary
  group by company_id
), quote_summary as (
  select
    company_id,
    count(*) filter (where status = 'Aceptado') as accepted_quotes,
    count(*) filter (where status = 'Ejecutado en cliente') as executed_quotes,
    round(coalesce(sum(coalesce(taxable_base, subtotal_sale, subtotal, 0)), 0), 2) as sale_amount,
    round(coalesce(sum(coalesce(tax_amount, 0)), 0), 2) as tax_amount,
    round(coalesce(sum(coalesce(total_amount, total, 0)), 0), 2) as total_amount
  from public.quotes
  where deleted_at is null
    and status in ('Aceptado','Ejecutado en cliente')
  group by company_id
)
select
  c.id as company_id,
  coalesce(cl.clients, 0) as clients,
  coalesce(eq.equipment, 0) as equipment,
  coalesce(wo.work_orders_this_month, 0) as work_orders_this_month,
  coalesce(q.accepted_quotes, 0) as accepted_quotes,
  coalesce(q.sale_amount, 0) as accepted_quote_amount,
  coalesce(wo.work_orders, 0) as work_orders,
  coalesce(wo.finished_work_orders, 0) as finished_work_orders,
  coalesce(wo.warranty_cost, 0) as warranty_cost,
  coalesce(wo.pending_invoice_work_orders, 0) as pending_invoice_work_orders,
  coalesce(q.executed_quotes, 0) as executed_quotes,
  coalesce(q.sale_amount, 0) as sale_amount,
  coalesce(q.tax_amount, 0) as tax_amount,
  coalesce(q.total_amount, 0) as total_amount,
  coalesce(wo.real_cost, 0) as real_cost,
  round(coalesce(q.sale_amount, 0) - coalesce(wo.real_cost, 0), 2) as margin_amount,
  case when coalesce(q.sale_amount, 0) > 0 then round((coalesce(q.sale_amount, 0) - coalesce(wo.real_cost, 0)) / coalesce(q.sale_amount, 0) * 100, 2) else null end as margin_percentage
from public.companies c
left join client_counts cl on cl.company_id = c.id
left join equipment_counts eq on eq.company_id = c.id
left join work_order_summary wo on wo.company_id = c.id
left join quote_summary q on q.company_id = c.id;

commit;
