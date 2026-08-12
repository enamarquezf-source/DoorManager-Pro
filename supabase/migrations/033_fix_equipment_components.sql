-- DoorManager Pro - componentes de equipos y base economica minima.
-- Idempotente. Mantiene RLS y evita elevacion de privilegios o vistas SECURITY DEFINER.

begin;

alter table public.equipment_components drop constraint if exists equipment_components_component_type_check;
alter table public.equipment_components add column if not exists updated_by uuid references public.profiles(id);

drop policy if exists equipment_components_company_policy on public.equipment_components;
drop policy if exists equipment_components_select_scoped on public.equipment_components;
drop policy if exists equipment_components_insert_operational on public.equipment_components;
drop policy if exists equipment_components_update_operational on public.equipment_components;
drop policy if exists equipment_components_delete_operational on public.equipment_components;

create policy equipment_components_select_scoped on public.equipment_components for select to authenticated
  using (
    deleted_at is null
    and company_id = public.current_company_id()
    and (
      public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina'])
      or exists (
        select 1
        from public.work_orders wo
        where wo.main_equipment_id = equipment_components.equipment_id
          and wo.deleted_at is null
          and public.is_assigned_to_work_order(wo.id, public.current_profile_id())
      )
    )
  );

create policy equipment_components_insert_operational on public.equipment_components for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia'])
    and exists (
      select 1
      from public.equipment e
      where e.id = equipment_components.equipment_id
        and e.company_id = equipment_components.company_id
        and e.deleted_at is null
    )
  );

create policy equipment_components_update_operational on public.equipment_components for update to authenticated
  using (
    deleted_at is null
    and company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia'])
  )
  with check (
    company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia'])
    and exists (
      select 1
      from public.equipment e
      where e.id = equipment_components.equipment_id
        and e.company_id = equipment_components.company_id
        and e.deleted_at is null
    )
  );

create policy equipment_components_delete_operational on public.equipment_components for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia'])
  );

alter table public.quotes add column if not exists equipment_id uuid references public.equipment(id);
alter table public.quotes add column if not exists work_order_id uuid references public.work_orders(id);
alter table public.quotes add column if not exists quote_type text not null default 'reparacion';
alter table public.quotes add column if not exists description text;
alter table public.quotes add column if not exists subtotal_cost numeric(12,2) not null default 0;
alter table public.quotes add column if not exists subtotal_sale numeric(12,2) not null default 0;
alter table public.quotes add column if not exists discount_amount numeric(12,2) not null default 0;
alter table public.quotes add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.quotes add column if not exists estimated_margin numeric(12,2) not null default 0;
alter table public.quotes add column if not exists updated_by uuid references public.profiles(id);

update public.quotes
set quote_type = lower(quote_type)
where quote_type in ('Instalacion','Reparacion','Mantenimiento');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_quote_type_check' and conrelid = 'public.quotes'::regclass) then
    alter table public.quotes add constraint quotes_quote_type_check check (quote_type in ('instalacion','reparacion','mantenimiento'));
  end if;
end $$;

alter table public.quote_lines add column if not exists line_type text not null default 'material';
alter table public.quote_lines add column if not exists unit_cost numeric(12,2) not null default 0;
alter table public.quote_lines add column if not exists unit text not null default 'ud';
alter table public.quote_lines add column if not exists total_cost numeric(12,2) not null default 0;
alter table public.quote_lines add column if not exists total_price numeric(12,2) not null default 0;
alter table public.quote_lines add column if not exists tax_rate numeric(5,2) not null default 21;
alter table public.quote_lines add column if not exists profile_id uuid references public.profiles(id);
alter table public.quote_lines add column if not exists updated_at timestamptz not null default now();
alter table public.quote_lines add column if not exists deleted_at timestamptz;

update public.quote_lines
set total_price = coalesce(nullif(total_price, 0), total),
    total_cost = coalesce(total_cost, 0)
where total_price = 0 or total_cost is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quote_lines_line_type_check' and conrelid = 'public.quote_lines'::regclass) then
    alter table public.quote_lines add constraint quote_lines_line_type_check check (line_type in ('material','labor','transport','travel','mobile_workshop','lifting_platform','auxiliary_equipment','external_cost','fee','discount','other'));
  end if;
end $$;

create or replace function public.dmp_recalculate_quote_totals(p_quote_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cost numeric(12,2);
  v_sale numeric(12,2);
  v_tax numeric(12,2);
begin
  select
    coalesce(sum(total_cost), 0),
    coalesce(sum(total_price), 0),
    coalesce(sum(total_price * tax_rate / 100), 0)
  into v_cost, v_sale, v_tax
  from public.quote_lines
  where quote_id = p_quote_id
    and deleted_at is null;

  update public.quotes
  set subtotal_cost = v_cost,
      subtotal_sale = v_sale,
      subtotal = v_sale,
      tax_amount = v_tax,
      total = greatest(v_sale - coalesce(discount_amount, 0), 0) + v_tax,
      total_amount = greatest(v_sale - coalesce(discount_amount, 0), 0) + v_tax,
      estimated_margin = greatest(v_sale - coalesce(discount_amount, 0), 0) - v_cost,
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
  new.total_cost := round(coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0), 2);
  new.total_price := round(coalesce(new.quantity, 0) * coalesce(new.unit_price, 0) * (1 - coalesce(new.discount_percent, 0) / 100), 2);
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

drop policy if exists quotes_update_commercial on public.quotes;
create policy quotes_update_commercial on public.quotes for update to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));

drop policy if exists quotes_delete_superadmin on public.quotes;
create policy quotes_delete_superadmin on public.quotes for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

commit;
