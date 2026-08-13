-- DoorManager Pro - corrige calculos economicos de lineas de presupuestos.
-- Idempotente. No modifica RLS ni usa claves de servicio.

begin;

create or replace function public.dmp_recalculate_quote_totals(p_quote_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cost numeric(12,2);
  v_sale numeric(12,2);
  v_tax numeric(12,2);
  v_discount numeric(12,2);
  v_taxable numeric(12,2);
begin
  select
    coalesce(sum(total_cost), 0),
    coalesce(sum(total_price), 0),
    coalesce(sum(total_price * tax_rate / 100), 0)
  into v_cost, v_sale, v_tax
  from public.quote_lines
  where quote_id = p_quote_id
    and deleted_at is null;

  select least(coalesce(discount_amount, 0), v_sale)
  into v_discount
  from public.quotes
  where id = p_quote_id;

  v_taxable := greatest(v_sale - coalesce(v_discount, 0), 0);

  update public.quotes
  set subtotal_cost = v_cost,
      subtotal_sale = v_sale,
      subtotal = v_sale,
      tax_amount = round(case when v_sale = 0 then 0 else v_tax * v_taxable / v_sale end, 2),
      total = v_taxable + round(case when v_sale = 0 then 0 else v_tax * v_taxable / v_sale end, 2),
      total_amount = v_taxable + round(case when v_sale = 0 then 0 else v_tax * v_taxable / v_sale end, 2),
      estimated_margin = v_taxable - v_cost,
      updated_at = now()
  where id = p_quote_id;
end;
$$;

create or replace function public.dmp_quote_lines_set_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.quantity := coalesce(new.quantity, 1);
  new.unit_cost := coalesce(new.unit_cost, 0);
  new.unit_price := coalesce(new.unit_price, 0);
  new.tax_rate := coalesce(new.tax_rate, 21);
  new.total_cost := round(new.quantity * new.unit_cost, 2);
  new.total_price := round(new.quantity * new.unit_price, 2);
  new.total := new.total_price;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.dmp_quote_lines_recalculate_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.dmp_recalculate_quote_totals(coalesce(new.quote_id, old.quote_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_lines_set_totals_trigger on public.quote_lines;
create trigger quote_lines_set_totals_trigger
  before insert or update on public.quote_lines
  for each row execute function public.dmp_quote_lines_set_totals_trigger();

drop trigger if exists quote_lines_recalculate_trigger on public.quote_lines;
create trigger quote_lines_recalculate_trigger
  after insert or update or delete on public.quote_lines
  for each row execute function public.dmp_quote_lines_recalculate_trigger();

update public.quote_lines
set total_cost = round(coalesce(quantity, 0) * coalesce(unit_cost, 0), 2),
    total_price = round(coalesce(quantity, 0) * coalesce(unit_price, 0), 2),
    total = round(coalesce(quantity, 0) * coalesce(unit_price, 0), 2),
    updated_at = now()
where deleted_at is null;

commit;
