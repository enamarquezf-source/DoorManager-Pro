-- DoorManager Pro - resumen economico real de partes y clientes.
-- Idempotente. No desactiva RLS, no usa service_role y las vistas son security_invoker.

begin;

alter table public.work_orders add column if not exists economic_status text not null default 'pendiente';
alter table public.work_orders add column if not exists billable boolean not null default true;
alter table public.work_orders add column if not exists warranty boolean not null default false;
alter table public.work_orders add column if not exists estimated_sale_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists real_cost_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists estimated_margin_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists invoiced_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists paid_amount numeric(12,2) not null default 0;

alter table public.work_orders drop constraint if exists work_orders_economic_status_check;
alter table public.work_orders add constraint work_orders_economic_status_check check (economic_status in ('pendiente','garantia','facturable','pendiente_facturar','facturado','cobrado','no_facturable'));

alter table public.work_order_time_entries add column if not exists hourly_cost numeric(12,2) not null default 0;
alter table public.work_order_time_entries add column if not exists hourly_price numeric(12,2) not null default 0;
alter table public.work_order_time_entries add column if not exists total_cost numeric(12,2) not null default 0;
alter table public.work_order_time_entries add column if not exists total_price numeric(12,2) not null default 0;

alter table public.work_order_materials add column if not exists unit_cost numeric(12,2) not null default 0;
alter table public.work_order_materials add column if not exists total_cost numeric(12,2) not null default 0;
alter table public.work_order_materials add column if not exists total_price numeric(12,2) not null default 0;

alter table public.work_order_cost_entries add column if not exists unit_price numeric(12,2) not null default 0;
alter table public.work_order_cost_entries add column if not exists total_cost numeric(12,2) not null default 0;
alter table public.work_order_cost_entries add column if not exists total_price numeric(12,2) not null default 0;

update public.work_order_time_entries
set total_cost = round(duration_minutes::numeric / 60 * coalesce(hourly_cost, 0), 2),
    total_price = round(duration_minutes::numeric / 60 * coalesce(hourly_price, 0), 2)
where true;

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

update public.work_order_cost_entries
set total_cost = round(coalesce(quantity, 0) * coalesce(unit_cost, 0), 2),
    total_price = round(coalesce(quantity, 0) * coalesce(unit_price, 0), 2)
where deleted_at is null;

create or replace function public.dmp_work_order_time_set_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.hourly_cost := coalesce(new.hourly_cost, 0);
  new.hourly_price := coalesce(new.hourly_price, 0);
  new.total_cost := round(coalesce(new.duration_minutes, 0)::numeric / 60 * new.hourly_cost, 2);
  new.total_price := round(coalesce(new.duration_minutes, 0)::numeric / 60 * new.hourly_price, 2);
  return new;
end;
$$;

drop trigger if exists work_order_time_set_totals_trigger on public.work_order_time_entries;
create trigger work_order_time_set_totals_trigger before insert or update on public.work_order_time_entries for each row execute function public.dmp_work_order_time_set_totals_trigger();

create or replace function public.dmp_work_order_material_set_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.unit_cost := coalesce(new.unit_cost, new.unit_price, 0);
  new.unit_price := coalesce(new.unit_price, 0);
  new.total_cost := round(coalesce(new.used_quantity, 0) * new.unit_cost, 2);
  new.total_price := round(coalesce(new.used_quantity, 0) * new.unit_price, 2);
  return new;
end;
$$;

drop trigger if exists work_order_material_set_totals_trigger on public.work_order_materials;
create trigger work_order_material_set_totals_trigger before insert or update on public.work_order_materials for each row execute function public.dmp_work_order_material_set_totals_trigger();

create or replace function public.dmp_work_order_cost_set_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.unit_cost := coalesce(new.unit_cost, 0);
  new.unit_price := coalesce(new.unit_price, 0);
  new.total_cost := round(coalesce(new.quantity, 0) * new.unit_cost, 2);
  new.total_price := round(coalesce(new.quantity, 0) * new.unit_price, 2);
  return new;
end;
$$;

drop trigger if exists work_order_cost_set_totals_trigger on public.work_order_cost_entries;
create trigger work_order_cost_set_totals_trigger before insert or update on public.work_order_cost_entries for each row execute function public.dmp_work_order_cost_set_totals_trigger();

create or replace view public.v_work_order_economic_summary
with (security_invoker = true)
as
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
  case when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then 0 else coalesce(nullif(wo.estimated_sale_amount, 0), q.subtotal_sale, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) end as estimated_sale_amount,
  case when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then null else round(coalesce(nullif(wo.estimated_sale_amount, 0), q.subtotal_sale, mat.material_sale + tim.time_sale + aux.auxiliary_sale, 0) - (coalesce(mat.material_cost, 0) + coalesce(tim.time_cost, 0) + coalesce(aux.auxiliary_cost, 0)), 2) end as estimated_margin_amount,
  wo.invoiced_amount,
  wo.paid_amount
from public.work_orders wo
left join public.clients c on c.id = wo.client_id
left join public.sites s on s.id = wo.site_id
left join public.equipment e on e.id = wo.main_equipment_id
left join lateral (select coalesce(sum(total_cost), 0) material_cost, coalesce(sum(total_price), 0) material_sale from public.work_order_materials where work_order_id = wo.id and deleted_at is null) mat on true
left join lateral (select coalesce(sum(total_cost), 0) time_cost, coalesce(sum(total_price), 0) time_sale from public.work_order_time_entries where work_order_id = wo.id) tim on true
left join lateral (select coalesce(sum(total_cost), 0) auxiliary_cost, coalesce(sum(total_price), 0) auxiliary_sale, coalesce(sum(total_cost) filter (where cost_type = 'desplazamiento'), 0) travel_cost, coalesce(sum(total_cost) filter (where cost_type = 'taller_movil'), 0) mobile_workshop_cost, coalesce(sum(total_cost) filter (where cost_type = 'plataforma_elevadora'), 0) platform_cost, coalesce(sum(total_cost) filter (where cost_type = 'coste_externo'), 0) external_cost from public.work_order_cost_entries where work_order_id = wo.id and deleted_at is null) aux on true
left join lateral (select subtotal_sale from public.quotes where work_order_id = wo.id and deleted_at is null and status in ('Aceptado','Ejecutado en cliente') order by updated_at desc limit 1) q on true
where wo.deleted_at is null;

create or replace view public.v_client_economic_summary
with (security_invoker = true)
as
select
  c.id,
  c.company_id,
  c.code,
  c.legal_name,
  coalesce(sum(w.real_cost_amount), 0) as real_cost_amount,
  coalesce(sum(w.estimated_sale_amount), 0) as estimated_sale_amount,
  coalesce(sum(w.estimated_margin_amount), 0) as estimated_margin_amount,
  count(w.id) filter (where w.warranty or w.economic_status = 'garantia') as warranty_work_orders,
  count(w.id) filter (where w.billable and w.economic_status in ('facturable','pendiente_facturar')) as billable_work_orders,
  count(w.id) filter (where w.economic_status = 'pendiente_facturar') as pending_invoice_work_orders,
  coalesce(sum(q.subtotal_sale), 0) as quote_sale_amount,
  coalesce(sum(q.total_amount), 0) as quote_total_amount,
  count(q.id) filter (where q.status = 'Aceptado') as accepted_quotes,
  count(q.id) filter (where q.status = 'Ejecutado en cliente') as executed_quotes
from public.clients c
left join public.v_work_order_economic_summary w on w.client_id = c.id
left join public.quotes q on q.client_id = c.id and q.deleted_at is null
where c.deleted_at is null
group by c.id, c.company_id, c.code, c.legal_name;

commit;
