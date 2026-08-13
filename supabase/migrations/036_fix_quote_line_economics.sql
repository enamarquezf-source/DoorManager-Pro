-- DoorManager Pro - corrige calculos economicos de lineas de presupuestos.
-- Idempotente. No modifica RLS ni usa claves de servicio.

begin;

alter table public.quotes add column if not exists discount_type text not null default 'amount';
alter table public.quotes add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.quotes add column if not exists taxable_base numeric(12,2) not null default 0;

alter table public.quotes drop constraint if exists quotes_discount_type_check;
alter table public.quotes add constraint quotes_discount_type_check check (discount_type in ('percentage','amount'));

alter table public.quotes drop constraint if exists quotes_discount_value_check;
alter table public.quotes add constraint quotes_discount_value_check check (discount_value >= 0 and (discount_type <> 'percentage' or discount_value <= 100));

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
  v_discount_type text;
  v_discount_value numeric(12,2);
begin
  select
    coalesce(sum(total_cost), 0),
    coalesce(sum(total_price), 0)
  into v_cost, v_sale
  from public.quote_lines
  where quote_id = p_quote_id
    and deleted_at is null;

  select coalesce(discount_type, 'percentage'), coalesce(discount_value, discount_amount, 0)
  into v_discount_type, v_discount_value
  from public.quotes
  where id = p_quote_id;

  v_discount := least(case when v_discount_type = 'percentage' then v_sale * coalesce(v_discount_value, 0) / 100 else coalesce(v_discount_value, 0) end, v_sale);

  v_taxable := greatest(v_sale - coalesce(v_discount, 0), 0);

  select coalesce(sum(case when v_sale = 0 then 0 else greatest(total_price - (total_price / v_sale) * coalesce(v_discount, 0), 0) * tax_rate / 100 end), 0)
  into v_tax
  from public.quote_lines
  where quote_id = p_quote_id
    and deleted_at is null;

  update public.quotes
  set subtotal_cost = round(v_cost, 2),
      subtotal_sale = round(v_sale, 2),
      subtotal = round(v_sale, 2),
      discount_amount = round(coalesce(v_discount, 0), 2),
      taxable_base = round(v_taxable, 2),
      tax_amount = round(v_tax, 2),
      total = round(v_taxable + v_tax, 2),
      total_amount = round(v_taxable + v_tax, 2),
      estimated_margin = round(v_taxable - v_cost, 2),
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

create or replace function public.dmp_quotes_recalculate_on_discount_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.dmp_recalculate_quote_totals(new.id);
  return new;
end;
$$;

drop trigger if exists quotes_recalculate_on_discount_trigger on public.quotes;
create trigger quotes_recalculate_on_discount_trigger
  after update of discount_type, discount_value on public.quotes
  for each row
  when (new.discount_type is distinct from old.discount_type or new.discount_value is distinct from old.discount_value)
  execute function public.dmp_quotes_recalculate_on_discount_trigger();

update public.quote_lines
set total_cost = round(coalesce(quantity, 0) * coalesce(unit_cost, 0), 2),
    total_price = round(coalesce(quantity, 0) * coalesce(unit_price, 0), 2),
    total = round(coalesce(quantity, 0) * coalesce(unit_price, 0), 2),
    updated_at = now()
where deleted_at is null;

commit;
