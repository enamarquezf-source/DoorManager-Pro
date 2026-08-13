-- DoorManager Pro - gestion completa minima de presupuestos.
-- Idempotente. Mantiene RLS por company_id y no usa claves de servicio.

begin;

alter table public.quotes add column if not exists conditions text;
alter table public.quotes add column if not exists sent_at timestamptz;
alter table public.quotes add column if not exists sent_to_email text;
alter table public.quotes add column if not exists discount_type text not null default 'amount';
alter table public.quotes add column if not exists discount_value numeric(12,2) not null default 0;
alter table public.quotes add column if not exists taxable_base numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_company_code_unique' and conrelid = 'public.quotes'::regclass) then
    alter table public.quotes add constraint quotes_company_code_unique unique (company_id, code);
  end if;
end $$;

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check check (status in ('Borrador','Enviado','Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado'));

alter table public.quotes drop constraint if exists quotes_quote_type_check;
alter table public.quotes add constraint quotes_quote_type_check check (quote_type in ('instalacion','reparacion','mantenimiento'));

alter table public.quotes drop constraint if exists quotes_discount_type_check;
alter table public.quotes add constraint quotes_discount_type_check check (discount_type in ('percentage','amount'));

alter table public.quotes drop constraint if exists quotes_discount_value_check;
alter table public.quotes add constraint quotes_discount_value_check check (discount_value >= 0 and (discount_type <> 'percentage' or discount_value <= 100));

alter table public.quote_lines drop constraint if exists quote_lines_line_type_check;
alter table public.quote_lines add constraint quote_lines_line_type_check check (line_type in ('material','labor','transport','travel','mobile_workshop','lifting_platform','auxiliary_equipment','external_cost','fee','discount','other'));

create or replace function public.assign_core_entity_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
begin
  if TG_OP = 'UPDATE' then
    if new.code is distinct from old.code then
      raise exception 'El codigo no se puede modificar';
    end if;
    return new;
  end if;

  if nullif(new.code, '') is not null then
    return new;
  end if;

  if TG_TABLE_NAME = 'clients' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'CLI', false, 6);
  elsif TG_TABLE_NAME = 'sites' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'CEN', false, 6);
  elsif TG_TABLE_NAME = 'equipment' then
    select case
      when lower(coalesce(name, '')) like '%barrera%' then 'EQ-BAR'
      when lower(coalesce(name, '')) like '%rapida%' or lower(coalesce(name, '')) like '%rápida%' then 'EQ-RAP'
      else 'EQ-SEC'
    end into v_prefix
    from public.equipment_types
    where id = new.equipment_type_id;
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, coalesce(v_prefix, 'EQ-SEC'), false, 6);
  elsif TG_TABLE_NAME = 'work_orders' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'PAR', true, 6);
  elsif TG_TABLE_NAME = 'checks' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'CHK', true, 6);
  elsif TG_TABLE_NAME = 'deficiencies' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'DEF', true, 6);
  elsif TG_TABLE_NAME = 'alerts' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'AVI', true, 6);
  elsif TG_TABLE_NAME = 'materials' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'MAT', false, 6);
  elsif TG_TABLE_NAME = 'opportunities' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'OPP', true, 6);
  elsif TG_TABLE_NAME = 'quotes' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'PRE', true, 6);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_quotes_auto_code on public.quotes;
create trigger trg_quotes_auto_code before insert or update of code on public.quotes for each row execute function public.assign_core_entity_code();

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

drop policy if exists quotes_select_commercial on public.quotes;
drop policy if exists quotes_write_commercial on public.quotes;
drop policy if exists quotes_update_commercial on public.quotes;
drop policy if exists quotes_delete_superadmin on public.quotes;

create policy quotes_select_commercial on public.quotes for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quotes_write_commercial on public.quotes for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy quotes_update_commercial on public.quotes for update to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy quotes_delete_superadmin on public.quotes for delete to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin']));

drop policy if exists quote_lines_select_commercial on public.quote_lines;
drop policy if exists quote_lines_insert_commercial on public.quote_lines;
drop policy if exists quote_lines_update_commercial on public.quote_lines;
drop policy if exists quote_lines_delete_superadmin on public.quote_lines;

create policy quote_lines_select_commercial on public.quote_lines for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quote_lines_insert_commercial on public.quote_lines for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy quote_lines_update_commercial on public.quote_lines for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy quote_lines_delete_superadmin on public.quote_lines for delete to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin']));

commit;
