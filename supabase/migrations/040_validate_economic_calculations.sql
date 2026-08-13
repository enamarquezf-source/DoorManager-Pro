-- DoorManager Pro - valida calculos economicos antes de cuadros de mando.
-- Idempotente. No desactiva RLS, no usa service_role y las vistas son security_invoker.

begin;

update public.work_order_materials wom
set unit_cost = coalesce(nullif(wom.unit_cost, 0), m.cost, wom.unit_price, 0),
    total_cost = round(coalesce(wom.used_quantity, 0) * coalesce(nullif(wom.unit_cost, 0), m.cost, wom.unit_price, 0), 2),
    total_price = round(coalesce(wom.used_quantity, 0) * coalesce(wom.unit_price, m.price, 0), 2)
from public.materials m
where wom.material_id = m.id
  and wom.deleted_at is null;

update public.work_order_materials
set total_cost = round(coalesce(used_quantity, 0) * coalesce(unit_cost, unit_price, 0), 2),
    total_price = round(coalesce(used_quantity, 0) * coalesce(unit_price, 0), 2)
where deleted_at is null
  and material_id is null;

create or replace view public.v_work_order_economic_summary
with (security_invoker = true)
as
with material_totals as (
  select
    company_id,
    work_order_id,
    coalesce(sum(total_cost), 0) as material_cost,
    coalesce(sum(total_price), 0) as material_sale
  from public.work_order_materials
  where deleted_at is null
  group by company_id, work_order_id
), time_totals as (
  select
    company_id,
    work_order_id,
    coalesce(sum(total_cost), 0) as time_cost,
    coalesce(sum(total_price), 0) as time_sale
  from public.work_order_time_entries
  group by company_id, work_order_id
), auxiliary_totals as (
  select
    company_id,
    work_order_id,
    coalesce(sum(total_cost), 0) as auxiliary_cost,
    coalesce(sum(total_price), 0) as auxiliary_sale,
    coalesce(sum(total_cost) filter (where cost_type = 'desplazamiento'), 0) as travel_cost,
    coalesce(sum(total_cost) filter (where cost_type = 'taller_movil'), 0) as mobile_workshop_cost,
    coalesce(sum(total_cost) filter (where cost_type = 'plataforma_elevadora'), 0) as platform_cost,
    coalesce(sum(total_cost) filter (where cost_type = 'coste_externo'), 0) as external_cost
  from public.work_order_cost_entries
  where deleted_at is null
  group by company_id, work_order_id
), accepted_quote_sales as (
  select distinct on (company_id, work_order_id)
    company_id,
    work_order_id,
    coalesce(taxable_base, subtotal_sale, subtotal, 0) as sale_amount
  from public.quotes
  where deleted_at is null
    and work_order_id is not null
    and status in ('Aceptado','Ejecutado en cliente')
  order by company_id, work_order_id, updated_at desc
)
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
  case when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then 0 else coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) end as estimated_sale_amount,
  case when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then round(0 - (coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0)), 2) else round(coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) - (coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0)), 2) end as estimated_margin_amount,
  wo.invoiced_amount,
  wo.paid_amount,
  case when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then 0 else coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) end as sale_amount,
  case when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then round(0 - (coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0)), 2) else round(coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) - (coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0)), 2) end as margin_amount,
  case when coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) > 0 and not (wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable')) then round((coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) - (coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0))) / coalesce(nullif(wo.estimated_sale_amount, 0), q.sale_amount, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) * 100, 2) else null end as margin_percentage,
  round(coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0), 2) as real_cost
from public.work_orders wo
left join public.clients c on c.id = wo.client_id and c.company_id = wo.company_id
left join public.sites s on s.id = wo.site_id and s.company_id = wo.company_id
left join public.equipment e on e.id = wo.main_equipment_id and e.company_id = wo.company_id
left join material_totals mat on mat.work_order_id = wo.id and mat.company_id = wo.company_id
left join time_totals tim on tim.work_order_id = wo.id and tim.company_id = wo.company_id
left join auxiliary_totals aux on aux.work_order_id = wo.id and aux.company_id = wo.company_id
left join accepted_quote_sales q on q.work_order_id = wo.id and q.company_id = wo.company_id
where wo.deleted_at is null;

create or replace view public.v_client_economic_summary
with (security_invoker = true)
as
with client_work_order_summary as (
  select
    company_id,
    client_id,
    coalesce(sum(real_cost_amount), 0) as real_cost,
    coalesce(sum(real_cost_amount) filter (where warranty or economic_status = 'garantia'), 0) as warranty_cost,
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
    coalesce(sum(coalesce(taxable_base, subtotal_sale, subtotal, 0)), 0) as sale_amount,
    coalesce(sum(coalesce(tax_amount, 0)), 0) as tax_amount,
    coalesce(sum(coalesce(total_amount, total, 0)), 0) as total_amount,
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
  coalesce(w.real_cost, 0) as real_cost_amount,
  coalesce(q.sale_amount, 0) as estimated_sale_amount,
  round(coalesce(q.sale_amount, 0) - coalesce(w.real_cost, 0), 2) as estimated_margin_amount,
  coalesce(w.warranty_work_orders, 0) as warranty_work_orders,
  coalesce(w.billable_work_orders, 0) as billable_work_orders,
  coalesce(w.pending_invoice_work_orders, 0) as pending_invoice_work_orders,
  coalesce(q.sale_amount, 0) as quote_sale_amount,
  coalesce(q.total_amount, 0) as quote_total_amount,
  coalesce(q.accepted_quotes, 0) as accepted_quotes,
  coalesce(q.executed_quotes, 0) as executed_quotes,
  coalesce(q.sale_amount, 0) as sale_amount,
  round(coalesce(q.sale_amount, 0) - coalesce(w.real_cost, 0), 2) as margin_amount,
  case when coalesce(q.sale_amount, 0) > 0 then round((coalesce(q.sale_amount, 0) - coalesce(w.real_cost, 0)) / coalesce(q.sale_amount, 0) * 100, 2) else null end as margin_percentage,
  coalesce(w.warranty_cost, 0) as warranty_cost,
  coalesce(q.tax_amount, 0) as quote_tax_amount,
  coalesce(w.real_cost, 0) as real_cost
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
    count(*) filter (where created_at >= date_trunc('month', now())) as work_orders_this_month,
    count(*) filter (where status in ('Finalizado tecnicamente','Enviado','Cerrado')) as finished_work_orders,
    count(*) filter (where economic_status = 'pendiente_facturar' or (status in ('Finalizado tecnicamente','Enviado','Cerrado') and coalesce(invoiced_amount, 0) = 0 and not warranty)) as pending_invoice_work_orders,
    coalesce(sum(real_cost_amount) filter (where warranty or economic_status = 'garantia'), 0) as warranty_cost,
    coalesce(sum(real_cost_amount), 0) as real_cost
  from public.v_work_order_economic_summary
  group by company_id
), quote_summary as (
  select
    company_id,
    count(*) filter (where status = 'Aceptado') as accepted_quotes,
    count(*) filter (where status = 'Ejecutado en cliente') as executed_quotes,
    coalesce(sum(coalesce(taxable_base, subtotal_sale, subtotal, 0)), 0) as sale_amount,
    coalesce(sum(coalesce(tax_amount, 0)), 0) as tax_amount,
    coalesce(sum(coalesce(total_amount, total, 0)), 0) as total_amount
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
