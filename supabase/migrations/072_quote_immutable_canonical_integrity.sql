-- DoorManager Pro - immutable accepted quotes and canonical quote-line snapshots.
-- Draft and sent quotes remain editable. Terminal commercial states are historical.

begin;

create or replace function public.dmp_quote_terminal_header_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado') then
    raise exception 'presupuesto bloqueado: los datos economicos de un presupuesto en estado % son historicos', old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_terminal_header_guard on public.quotes;
create trigger quote_terminal_header_guard
  before update of company_id, code, opportunity_id, client_id, site_id,
     equipment_id, case_id, work_order_id, quote_type, title, description,
     issue_date, valid_until, discount_type, discount_value, subtotal_cost,
     subtotal_sale, subtotal, discount_amount, taxable_base, tax_amount, total,
     total_amount, estimated_margin, conditions, sent_at, sent_to_email
  on public.quotes
  for each row execute function public.dmp_quote_terminal_header_guard();

create or replace function public.dmp_quote_line_editable_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_status text;
begin
  v_quote_id := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  select status into v_status from public.quotes where id = v_quote_id;
  if v_status is null then raise exception 'presupuesto: presupuesto no encontrado'; end if;
  if v_status not in ('Borrador','Enviado') then
    raise exception 'presupuesto bloqueado: no se pueden modificar lineas en estado %', v_status;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists quote_line_editable_guard on public.quote_lines;
create trigger quote_line_editable_guard
  before insert or update or delete on public.quote_lines
  for each row execute function public.dmp_quote_line_editable_guard();

-- Replaces the effective 060 trigger. The database owns catalog economics for
-- both generic rates and catalog materials, even for forged REST payloads.
create or replace function public.dmp_quote_line_rate_snapshot_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_catalog public.rate_catalog;
  v_version public.rate_versions;
  v_material public.materials;
  v_count integer;
begin
  select * into v_quote
  from public.quotes
  where id = new.quote_id and company_id = new.company_id and deleted_at is null;
  if v_quote.id is null then raise exception 'presupuesto: presupuesto no encontrado o fuera de la empresa'; end if;

  if new.concept_id is not null and new.material_id is not null then
    raise exception 'linea: no puede combinar concepto de tarifa y material de catalogo';
  end if;

  if new.concept_id is not null then
    select * into v_catalog
    from public.rate_catalog
    where id = new.concept_id and company_id = new.company_id and active and deleted_at is null;
    if v_catalog.id is null then raise exception 'concepto: concept_id no pertenece al catalogo activo de la empresa'; end if;

    if new.rate_version_id is null then
      select count(*) into v_count
      from public.rate_versions v
      where v.company_id = new.company_id
        and v.rate_id = v_catalog.id
        and v.technician_profile_id is null
        and v.active and v.deleted_at is null
        and v.valid_from <= coalesce(v_quote.issue_date, current_date)
        and (v.valid_to is null or v.valid_to >= coalesce(v_quote.issue_date, current_date));
      if v_count <> 1 then raise exception 'tarifa: el concepto no tiene una unica version generica vigente'; end if;
      select * into v_version
      from public.rate_versions v
      where v.company_id = new.company_id
        and v.rate_id = v_catalog.id
        and v.technician_profile_id is null
        and v.active and v.deleted_at is null
        and v.valid_from <= coalesce(v_quote.issue_date, current_date)
        and (v.valid_to is null or v.valid_to >= coalesce(v_quote.issue_date, current_date))
      order by v.valid_from desc, v.created_at desc
      limit 1;
    else
      select * into v_version
      from public.rate_versions v
      where v.id = new.rate_version_id
        and v.company_id = new.company_id
        and v.rate_id = v_catalog.id
        and v.technician_profile_id is null
        and v.active and v.deleted_at is null
        and v.valid_from <= coalesce(v_quote.issue_date, current_date)
        and (v.valid_to is null or v.valid_to >= coalesce(v_quote.issue_date, current_date));
      if v_version.id is null then raise exception 'tarifa: rate_version_id generica no es valida para la fecha del presupuesto'; end if;
    end if;

    new.material_id := null;
    new.rate_version_id := v_version.id;
    new.unit := v_catalog.unit;
    new.billing_mode := v_catalog.billing_mode;
    new.period_days := v_catalog.period_days;
    new.contributes_to_sale := v_catalog.contributes_to_sale;
    new.unit_cost := v_version.cost_amount;
    new.unit_price := v_version.sale_amount;
  elsif new.material_id is not null then
    select * into v_material
    from public.materials m
    where m.id = new.material_id
      and m.company_id = new.company_id
      and m.active and m.deleted_at is null;
    if v_material.id is null then raise exception 'material: material no encontrado o fuera del catalogo activo'; end if;
    new.concept_id := null;
    new.rate_version_id := null;
    new.billing_mode := null;
    new.period_days := null;
    new.contributes_to_sale := true;
    new.unit := v_material.unit;
    new.unit_cost := coalesce(v_material.cost, 0);
    new.unit_price := coalesce(v_material.price, 0);
  else
    -- A manual line must not retain traceability from a previously selected rate.
    new.concept_id := null;
    new.rate_version_id := null;
    new.material_id := null;
    new.billing_mode := null;
    new.period_days := null;
    new.contributes_to_sale := coalesce(new.contributes_to_sale, true);
  end if;

  new.total_cost := round(coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0), 2);
  new.total_price := round(coalesce(new.quantity, 0) * coalesce(new.unit_price, 0) * (1 - coalesce(new.discount_percent, 0) / 100), 2);
  return new;
end;
$$;

commit;
