-- DoorManager Pro 061 - normaliza el catalogo operativo sin reconstruir historia.

begin;

create temp table dmp_061_expected_source (
  category text primary key,
  hourly_cost numeric(12,2) not null,
  hourly_price numeric(12,2) not null,
  valid_from date not null,
  valid_to date
) on commit drop;

insert into dmp_061_expected_source(category, hourly_cost, hourly_price, valid_from, valid_to)
values
  ('Técnico', 22, 110, '2026-08-14', null),
  ('Desplazamiento', 35, 55, '2026-08-14', null),
  ('Grúa', 38, 95, '2026-08-20', null),
  ('Plataforma elevadora PEMP', 38, 250, '2026-08-20', null);

do $$
declare
  e record;
  v_total bigint;
  v_matching bigint;
begin
  for e in select * from dmp_061_expected_source loop
    select count(*), count(*) filter (where h.hourly_cost = e.hourly_cost
      and h.hourly_price = e.hourly_price
      and h.valid_from = e.valid_from
      and h.valid_to is not distinct from e.valid_to
      and h.active
      and h.deleted_at is null)
      into v_total, v_matching
    from public.technician_hour_rates h
    where h.company_id = '00000000-0000-0000-0000-000000000001'::uuid
      and lower(trim(coalesce(h.category, ''))) = lower(trim(e.category));

    if v_total <> 1 or v_matching <> 1 then
      raise exception '061 preflight: fuente legacy incompatible o ambigua para categoria % (total %, compatibles %)', e.category, v_total, v_matching;
    end if;
  end loop;
end $$;

create temp table dmp_061_cost_baseline on commit drop as
select source, count(*)::bigint as row_count,
  coalesce(sum(total_cost), 0)::numeric as total_cost,
  coalesce(sum(total_price), 0)::numeric as total_price
from public.work_order_cost_entries
group by source;

create temp table dmp_061_time_baseline on commit drop as
select count(*)::bigint as row_count,
  coalesce(sum(total_cost), 0)::numeric as total_cost,
  coalesce(sum(total_price), 0)::numeric as total_price
from public.work_order_time_entries;

create temp table dmp_061_legacy (
  id uuid primary key,
  code text not null,
  expected_name text not null,
  expected_classification text not null,
  is_labor boolean not null
) on commit drop;

insert into dmp_061_legacy(id, code, expected_name, expected_classification, is_labor)
values
  ('b05f7d96-e166-403a-8aea-432ef7ef764e', 'legacy-cost-b05f7d96-e166-403a-8aea-432ef7ef764e', 'Desplazamiento', 'cost', false),
  ('4ac78458-45e3-4088-8a57-8dec8127c4cc', 'legacy-cost-4ac78458-45e3-4088-8a57-8dec8127c4cc', 'Grúa', 'cost', false),
  ('7de2c892-ecf4-41af-a77d-200bef3e3bd8', 'legacy-cost-7de2c892-ecf4-41af-a77d-200bef3e3bd8', 'Plataforma elevadora PEMP', 'cost', false),
  ('d54e03d2-b18f-48d6-aae8-ba52f88fc7f2', 'legacy-hour-d54e03d2-b18f-48d6-aae8-ba52f88fc7f2', 'Técnico', 'labor', true);

do $$
declare
  e record;
  v_catalog_count bigint;
  v_time_rate_refs bigint;
  v_time_version_refs bigint;
  v_cost_concept_refs bigint;
  v_cost_rate_refs bigint;
  v_quote_concept_refs bigint;
  v_quote_version_refs bigint;
  v_version_count bigint;
  v_matching_versions bigint;
begin
  for e in select * from dmp_061_legacy loop
    select count(*) into v_catalog_count
    from public.rate_catalog c
    where c.company_id = '00000000-0000-0000-0000-000000000001'::uuid
      and c.id = e.id and c.code = e.code
      and c.name = e.expected_name and c.classification = e.expected_classification;
    if v_catalog_count <> 1 then
      raise exception '061 preflight: concepto legacy incompatible o inexistente %', e.code;
    end if;

    select count(*) into v_time_rate_refs from public.work_order_time_entries t where t.rate_id = e.id;
    select count(*) into v_time_version_refs
    from public.work_order_time_entries t
    join public.rate_versions v on v.id = t.rate_version_id
    where v.rate_id = e.id;
    select count(*) into v_cost_concept_refs from public.work_order_cost_entries c where c.concept_id = e.id;
    select count(*) into v_cost_rate_refs from public.work_order_cost_entries c where c.rate_id = e.id;
    select count(*) into v_quote_concept_refs from public.quote_lines q where q.concept_id = e.id;
    select count(*) into v_quote_version_refs
    from public.quote_lines q
    join public.rate_versions v on v.id = q.rate_version_id
    where v.rate_id = e.id;

    if v_time_rate_refs <> 0 or v_time_version_refs <> 0 or v_cost_concept_refs <> 0
       or v_cost_rate_refs <> 0 or v_quote_concept_refs <> 0 or v_quote_version_refs <> 0 then
      raise exception '061 preflight: concepto legacy % tiene referencias operativas', e.code;
    end if;

    select count(*) into v_version_count from public.rate_versions v where v.rate_id = e.id;
    if e.is_labor then
      select count(*) into v_matching_versions
      from public.rate_versions v
      where v.rate_id = e.id and v.cost_amount = 22 and v.sale_amount = 110
        and v.valid_from = '2026-08-14'::date and v.valid_to is null
        and v.technician_profile_id is null;
      if v_version_count <> 1 or v_matching_versions <> 1 then
        raise exception '061 preflight: version legacy de Técnico incompatible o ambigua';
      end if;
    elsif v_version_count <> 0 then
      raise exception '061 preflight: concepto legacy de coste % tiene versiones inesperadas', e.code;
    end if;
  end loop;
end $$;

create temp table dmp_061_expected_catalog (
  code text primary key,
  name text not null,
  kind text not null,
  classification text not null,
  unit text not null,
  billing_mode text not null,
  period_days integer
) on commit drop;

insert into dmp_061_expected_catalog(code, name, kind, classification, unit, billing_mode, period_days)
values
  ('tecnico', 'Técnico', 'labor', 'labor', 'h', 'hour', null),
  ('desplazamiento', 'Desplazamiento', 'cost', 'cost', 'ud', 'unit', null),
  ('grua', 'Grua', 'cost', 'cost', 'ud', 'unit', null),
  ('pemp', 'PEMP', 'cost', 'cost', 'period', 'period', 3);

insert into public.rate_catalog(company_id, code, name, kind, classification, unit, billing_mode, period_days, contributes_to_sale, active, created_by, updated_by)
select '00000000-0000-0000-0000-000000000001'::uuid, e.code, e.name, e.kind, e.classification, e.unit, e.billing_mode, e.period_days, false, true, null, null
from dmp_061_expected_catalog e
on conflict (company_id, code) do nothing;

do $$
declare
  e record;
  v_id uuid;
  v_count bigint;
  v_period_days integer;
begin
  for e in select * from dmp_061_expected_catalog loop
    select c.id, c.period_days into v_id, v_period_days
    from public.rate_catalog c
    where c.company_id = '00000000-0000-0000-0000-000000000001'::uuid and c.code = e.code;
    if v_id is null then
      raise exception '061: no se pudo obtener el concepto canonico %', e.code;
    end if;
    select count(*) into v_count
    from public.rate_catalog c
    where c.id = v_id and c.kind = e.kind and c.classification = e.classification
      and c.unit = e.unit and c.billing_mode = e.billing_mode;
    if v_count <> 1 then
      raise exception '061: definicion incompatible para concepto canonico %', e.code;
    end if;
    if e.code = 'pemp' and v_period_days is not null and v_period_days <> 3 then
      raise exception '061: period_days incompatible para PEMP (%)', v_period_days;
    end if;
  end loop;
end $$;

update public.rate_catalog c
set period_days = 3
where c.company_id = '00000000-0000-0000-0000-000000000001'::uuid
  and c.code = 'pemp' and c.period_days is distinct from 3;
-- No se calcula automaticamente desde fechas: quantity sigue siendo el numero explicito de periodos.

update public.rate_catalog c
set active = true, deleted_at = null, updated_at = now()
where c.company_id = '00000000-0000-0000-0000-000000000001'::uuid
  and c.code in ('tecnico', 'desplazamiento', 'grua', 'pemp')
  and (not c.active or c.deleted_at is not null);

create temp table dmp_061_expected_versions (
  code text primary key,
  cost_amount numeric(12,2) not null,
  sale_amount numeric(12,2) not null,
  valid_from date not null
) on commit drop;

insert into dmp_061_expected_versions(code, cost_amount, sale_amount, valid_from)
values
  ('tecnico', 22, 110, '2026-08-14'),
  ('desplazamiento', 35, 55, '2026-08-14'),
  ('grua', 38, 95, '2026-08-20'),
  ('pemp', 38, 250, '2026-08-20');

do $$
declare
  e record;
  v_rate_id uuid;
  v_equivalent bigint;
begin
  for e in select ev.*, c.id as rate_id
    from dmp_061_expected_versions ev
    join public.rate_catalog c on c.company_id = '00000000-0000-0000-0000-000000000001'::uuid and c.code = ev.code loop
    perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', '00000000-0000-0000-0000-000000000001', e.rate_id::text, '00000000-0000-0000-0000-000000000000'), 0));

    select count(*) into v_equivalent
    from public.rate_versions v
    where v.company_id = '00000000-0000-0000-0000-000000000001'::uuid
      and v.rate_id = e.rate_id and v.technician_profile_id is null
      and v.cost_amount = e.cost_amount and v.sale_amount = e.sale_amount
      and v.valid_from = e.valid_from and v.valid_to is null
      and v.active and v.deleted_at is null;
    if v_equivalent > 1 then
      raise exception '061: existen varias versiones canonicas equivalentes para %', e.code;
    end if;
    if v_equivalent = 0 and exists (
      select 1 from public.rate_versions v
      where v.company_id = '00000000-0000-0000-0000-000000000001'::uuid
        and v.rate_id = e.rate_id and v.scope_profile_id = '00000000-0000-0000-0000-000000000000'::uuid
        and v.active and v.deleted_at is null
        and daterange(v.valid_from, coalesce(v.valid_to, '9999-12-31'::date), '[]')
          && daterange(e.valid_from, '9999-12-31'::date, '[]')
    ) then
      raise exception '061: version activa solapada e incompatible para %', e.code;
    end if;
    if v_equivalent = 0 then
      insert into public.rate_versions(company_id, rate_id, technician_profile_id, cost_amount, sale_amount, valid_from, valid_to, active, created_by, updated_by, notes)
      values ('00000000-0000-0000-0000-000000000001'::uuid, e.rate_id, null, e.cost_amount, e.sale_amount, e.valid_from, null, true, null, null, 'Version canonica operativa creada por 061');
    end if;
  end loop;
end $$;

update public.rate_versions v
set active = false,
    deleted_at = coalesce(v.deleted_at, now()),
    updated_at = now(),
    notes = case when position('Archivada por 061' in coalesce(v.notes, '')) = 0
      then coalesce(v.notes, '') || case when coalesce(v.notes, '') = '' then '' else ' · ' end || 'Archivada por 061'
      else v.notes end
where v.company_id = '00000000-0000-0000-0000-000000000001'::uuid
  and v.rate_id = 'd54e03d2-b18f-48d6-aae8-ba52f88fc7f2'::uuid
  and (v.active or v.deleted_at is null or position('Archivada por 061' in coalesce(v.notes, '')) = 0);

update public.rate_catalog c
set active = false,
    deleted_at = coalesce(c.deleted_at, now()),
    updated_at = now(),
    notes = case when position('Archivado por 061' in coalesce(c.notes, '')) = 0
      then coalesce(c.notes, '') || case when coalesce(c.notes, '') = '' then '' else ' · ' end || 'Archivado por 061'
      else c.notes end
where c.company_id = '00000000-0000-0000-0000-000000000001'::uuid
  and c.id in (
    'b05f7d96-e166-403a-8aea-432ef7ef764e'::uuid,
    '4ac78458-45e3-4088-8a57-8dec8127c4cc'::uuid,
    '7de2c892-ecf4-41af-a77d-200bef3e3bd8'::uuid,
    'd54e03d2-b18f-48d6-aae8-ba52f88fc7f2'::uuid
  )
  and (c.active or c.deleted_at is null or position('Archivado por 061' in coalesce(c.notes, '')) = 0);

do $$
begin
  if exists (
    select source, count(*)::bigint, coalesce(sum(total_cost), 0)::numeric, coalesce(sum(total_price), 0)::numeric
    from public.work_order_cost_entries group by source
    except
    select source, row_count, total_cost, total_price from dmp_061_cost_baseline
  ) or exists (
    select source, row_count, total_cost, total_price from dmp_061_cost_baseline
    except
    select source, count(*)::bigint, coalesce(sum(total_cost), 0)::numeric, coalesce(sum(total_price), 0)::numeric
    from public.work_order_cost_entries group by source
  ) then
    raise exception '061 integridad: cambiaron los snapshots economicos de work_order_cost_entries';
  end if;

  if exists (
    select count(*)::bigint, coalesce(sum(total_cost), 0)::numeric, coalesce(sum(total_price), 0)::numeric
    from public.work_order_time_entries
    except
    select row_count, total_cost, total_price from dmp_061_time_baseline
  ) or exists (
    select row_count, total_cost, total_price from dmp_061_time_baseline
    except
    select count(*)::bigint, coalesce(sum(total_cost), 0)::numeric, coalesce(sum(total_price), 0)::numeric
    from public.work_order_time_entries
  ) then
    raise exception '061 integridad: cambiaron los snapshots economicos de work_order_time_entries';
  end if;
end $$;

commit;
