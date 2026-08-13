-- DoorManager Pro - corrige venta unitaria de presupuestos afectada por mapeos antiguos.
-- Idempotente. No modifica RLS ni usa claves de servicio.

begin;

alter table public.quote_lines alter column unit_price set default 0;

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

with affected as (
  update public.quote_lines
  set unit_price = unit_cost,
      total_price = round(coalesce(quantity, 0) * coalesce(unit_cost, 0), 2),
      total = round(coalesce(quantity, 0) * coalesce(unit_cost, 0), 2),
      updated_at = now()
  where deleted_at is null
    and unit_price = 1
    and unit_cost > 1
    and total_price = quantity
  returning quote_id
)
select public.dmp_recalculate_quote_totals(quote_id)
from (select distinct quote_id from affected) fixed_quotes;

commit;
