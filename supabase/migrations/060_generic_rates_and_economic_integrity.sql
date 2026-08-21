-- DoorManager Pro 060 - catalogo generico de tarifas y economia server-side.
-- Additivo: conserva las tarifas y snapshots anteriores y mantiene source de 059.

begin;

create extension if not exists btree_gist with schema public;

create table if not exists public.rate_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  name text not null,
  kind text not null default 'cost' check (kind in ('labor','cost')),
  classification text not null default 'cost' check (classification in ('labor','cost')),
  unit text not null default 'ud',
  billing_mode text not null default 'unit' check (billing_mode in ('unit','hour','day','period')),
  period_days integer check (period_days is null or period_days > 0),
  contributes_to_sale boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (company_id, code)
);

create table if not exists public.rate_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  rate_id uuid not null references public.rate_catalog(id),
  technician_profile_id uuid references public.profiles(id),
  category text,
  cost_amount numeric(12,2) not null default 0 check (cost_amount >= 0),
  sale_amount numeric(12,2) not null default 0 check (sale_amount >= 0),
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  scope_profile_id uuid generated always as (coalesce(technician_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  constraint rate_versions_company_match check (company_id is not null),
  constraint rate_versions_valid_range check (valid_to is null or valid_to >= valid_from)
);
do $$
declare
  v_type text;
  v_generated "char";
  v_not_null boolean;
  v_expression text;
  v_expected_expression text := lower(regexp_replace(format('coalesce(technician_profile_id, %L::uuid)', '00000000-0000-0000-0000-000000000000'), '\s+', '', 'g'));
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.rate_versions'::regclass
      and attname = 'scope_profile_id'
      and not attisdropped
  ) then
    alter table public.rate_versions add column scope_profile_id uuid generated always as (coalesce(technician_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;
  else
    select format_type(a.atttypid, a.atttypmod), a.attgenerated, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into v_type, v_generated, v_not_null, v_expression
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.rate_versions'::regclass
      and a.attname = 'scope_profile_id'
      and not a.attisdropped;

    if v_type <> 'uuid'
       or v_generated <> 's'
       or v_not_null
       or lower(regexp_replace(coalesce(v_expression, ''), '\s+', '', 'g')) <> v_expected_expression then
      raise exception '060 preflight: rate_versions.scope_profile_id tiene una definicion incompatible; se esperaba uuid generated always as coalesce(technician_profile_id, UUID sentinel) stored';
    end if;
  end if;
end $$;
alter table public.rate_catalog add column if not exists classification text not null default 'cost' check (classification in ('labor','cost'));
alter table public.rate_catalog add column if not exists contributes_to_sale boolean not null default false;
alter table public.rate_catalog add column if not exists created_by uuid references public.profiles(id);
alter table public.rate_catalog add column if not exists updated_by uuid references public.profiles(id);
alter table public.rate_versions add column if not exists created_by uuid references public.profiles(id);
alter table public.rate_versions add column if not exists updated_by uuid references public.profiles(id);
update public.rate_catalog set classification = case when kind = 'labor' then 'labor' else 'cost' end where classification is distinct from case when kind = 'labor' then 'labor' else 'cost' end;
-- Repair a previously interrupted/local 060 attempt without deleting snapshots:
-- legacy-hour rows whose source category is not explicitly labor are archived and
-- represented by a unit-cost placeholder below.
update public.rate_versions v set active=false, deleted_at=coalesce(v.deleted_at, now()), updated_at=now(), notes=coalesce(v.notes,'') || ' · Archivada por clasificacion 060'
from public.rate_catalog c join public.technician_hour_rates h on c.company_id=h.company_id and c.code='legacy-hour-' || h.id::text
where v.rate_id=c.id and h.deleted_at is null and lower(trim(coalesce(h.category,''))) not in ('tecnico','técnico','tecnicos','técnicos','oficial','ayudante','mano de obra','labor','hora','horas')
  and position('Archivada por clasificacion 060' in coalesce(v.notes,'')) = 0;
update public.rate_catalog c set kind='cost', classification='cost', unit='ud', billing_mode='unit', updated_at=now(), notes=coalesce(c.notes,'') || ' · Placeholder corregido por clasificacion 060'
from public.technician_hour_rates h
where c.company_id=h.company_id and c.code='legacy-hour-' || h.id::text
  and h.deleted_at is null and lower(trim(coalesce(h.category,''))) not in ('tecnico','técnico','tecnicos','técnicos','oficial','ayudante','mano de obra','labor','hora','horas')
  and position('Placeholder corregido por clasificacion 060' in coalesce(c.notes,'')) = 0;

create index if not exists rate_catalog_company_active_idx on public.rate_catalog(company_id, kind, active, deleted_at);
create index if not exists rate_versions_resolution_idx on public.rate_versions(company_id, rate_id, technician_profile_id, valid_from, valid_to) where deleted_at is null;
do $$
declare
  v_invalid_count bigint;
begin
  select count(*) into v_invalid_count
  from public.rate_versions v
  left join public.rate_catalog c on c.id = v.rate_id
  where c.id is null or v.company_id is distinct from c.company_id;
  if v_invalid_count > 0 then
    raise exception '060 preflight: existen rate_versions con catalogo inexistente o perteneciente a otra empresa (% filas)', v_invalid_count;
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rate_catalog'::regclass and conname = 'rate_catalog_company_id_unique') then
    alter table public.rate_catalog add constraint rate_catalog_company_id_unique unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.rate_versions'::regclass and conname = 'rate_versions_company_id_unique') then
    alter table public.rate_versions add constraint rate_versions_company_id_unique unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.rate_versions'::regclass and conname = 'rate_versions_catalog_company_fk') then
    alter table public.rate_versions add constraint rate_versions_catalog_company_fk foreign key (company_id, rate_id) references public.rate_catalog(company_id, id);
  end if;
end $$;

-- Existing 042 rows can contain overlapping effective ranges. Never rewrite them
-- and never let their import fail the whole migration. Ambiguous rows are kept in
-- technician_hour_rates and deliberately receive no 060 version.
drop table if exists dmp_060_safe_hour_rates;
create temp table dmp_060_safe_hour_rates as
select h.id
from public.technician_hour_rates h
where h.deleted_at is null
  and h.active
  and lower(trim(coalesce(h.category,''))) in ('tecnico','técnico','tecnicos','técnicos','oficial','ayudante','mano de obra','labor','hora','horas')
  and not exists (
    select 1 from public.technician_hour_rates h2
    where h2.id <> h.id and h2.company_id = h.company_id
      and h2.technician_profile_id is not distinct from h.technician_profile_id
      and h2.deleted_at is null and h2.active
      and lower(trim(coalesce(h2.category,''))) in ('tecnico','técnico','tecnicos','técnicos','oficial','ayudante','mano de obra','labor','hora','horas')
      and daterange(h2.valid_from, coalesce(h2.valid_to, '9999-12-31'::date), '[]') && daterange(h.valid_from, coalesce(h.valid_to, '9999-12-31'::date), '[]')
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.rate_versions'::regclass and conname = 'rate_versions_no_overlap')
     and not exists (
       select 1 from public.rate_versions a join public.rate_versions b
         on a.id < b.id and a.company_id = b.company_id and a.rate_id = b.rate_id
         and a.scope_profile_id = b.scope_profile_id
         and daterange(a.valid_from, coalesce(a.valid_to, '9999-12-31'::date), '[]') && daterange(b.valid_from, coalesce(b.valid_to, '9999-12-31'::date), '[]')
       where a.active and b.active and a.deleted_at is null and b.deleted_at is null
     ) then
    alter table public.rate_versions add constraint rate_versions_no_overlap exclude using gist
      (company_id with =, rate_id with =, scope_profile_id with =,
       daterange(valid_from, coalesce(valid_to, '9999-12-31'::date), '[]') with &&)
      where (active and deleted_at is null);
  else
    raise notice '060: exclusion omitida porque ya existen versiones activas solapadas; no se modifican datos historicos';
  end if;
end $$;

alter table public.work_order_time_entries add column if not exists rate_id uuid references public.rate_catalog(id);
alter table public.work_order_time_entries add column if not exists rate_version_id uuid references public.rate_versions(id);
alter table public.work_order_cost_entries add column if not exists rate_id uuid references public.rate_catalog(id);
alter table public.work_order_cost_entries add column if not exists rate_version_id uuid references public.rate_versions(id);
alter table public.work_order_cost_entries add column if not exists concept_id uuid references public.rate_catalog(id);
alter table public.work_order_time_entries add column if not exists billing_mode text;
alter table public.work_order_time_entries add column if not exists period_days integer;
alter table public.work_order_cost_entries add column if not exists billing_mode text;
alter table public.work_order_cost_entries add column if not exists period_days integer;
alter table public.work_order_cost_entries add column if not exists contributes_to_sale boolean not null default false;
alter table public.quote_lines add column if not exists rate_version_id uuid references public.rate_versions(id);
alter table public.quote_lines add column if not exists concept_id uuid references public.rate_catalog(id);
alter table public.quote_lines add column if not exists billing_mode text;
alter table public.quote_lines add column if not exists period_days integer;
alter table public.quote_lines add column if not exists contributes_to_sale boolean not null default false;
alter table public.work_orders add column if not exists quoted_sale_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists additional_sale_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists sale_amount numeric(12,2) not null default 0;
alter table public.work_orders add column if not exists margin_amount numeric(12,2) not null default 0;

-- Fail before adding tenant-scoped foreign keys; never repair or delete historical rows.
do $$
begin
  if exists (select 1 from public.work_order_time_entries e where e.rate_id is not null and not exists (select 1 from public.rate_catalog c where c.company_id=e.company_id and c.id=e.rate_id)) then
    raise exception '060 preflight: work_order_time_entries contiene rate_id de otra empresa o inexistente';
  end if;
  if exists (select 1 from public.work_order_time_entries e where e.rate_version_id is not null and not exists (select 1 from public.rate_versions v where v.company_id=e.company_id and v.id=e.rate_version_id)) then
    raise exception '060 preflight: work_order_time_entries contiene rate_version_id de otra empresa o inexistente';
  end if;
  if exists (select 1 from public.work_order_cost_entries e where e.rate_id is not null and not exists (select 1 from public.rate_catalog c where c.company_id=e.company_id and c.id=e.rate_id)) then
    raise exception '060 preflight: work_order_cost_entries contiene rate_id de otra empresa o inexistente';
  end if;
  if exists (select 1 from public.work_order_cost_entries e where e.rate_version_id is not null and not exists (select 1 from public.rate_versions v where v.company_id=e.company_id and v.id=e.rate_version_id)) then
    raise exception '060 preflight: work_order_cost_entries contiene rate_version_id de otra empresa o inexistente';
  end if;
  if exists (select 1 from public.work_order_cost_entries e where e.concept_id is not null and not exists (select 1 from public.rate_catalog c where c.company_id=e.company_id and c.id=e.concept_id)) then
    raise exception '060 preflight: work_order_cost_entries contiene concept_id de otra empresa o inexistente';
  end if;
  if exists (select 1 from public.quote_lines e where e.rate_version_id is not null and not exists (select 1 from public.rate_versions v where v.company_id=e.company_id and v.id=e.rate_version_id)) then
    raise exception '060 preflight: quote_lines contiene rate_version_id de otra empresa o inexistente';
  end if;
  if exists (select 1 from public.quote_lines e where e.concept_id is not null and not exists (select 1 from public.rate_catalog c where c.company_id=e.company_id and c.id=e.concept_id)) then
    raise exception '060 preflight: quote_lines contiene concept_id de otra empresa o inexistente';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.work_order_time_entries'::regclass and conname='work_order_time_entries_company_rate_fk') then
    alter table public.work_order_time_entries add constraint work_order_time_entries_company_rate_fk foreign key (company_id, rate_id) references public.rate_catalog(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.work_order_time_entries'::regclass and conname='work_order_time_entries_company_rate_version_fk') then
    alter table public.work_order_time_entries add constraint work_order_time_entries_company_rate_version_fk foreign key (company_id, rate_version_id) references public.rate_versions(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.work_order_cost_entries'::regclass and conname='work_order_cost_entries_company_rate_fk') then
    alter table public.work_order_cost_entries add constraint work_order_cost_entries_company_rate_fk foreign key (company_id, rate_id) references public.rate_catalog(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.work_order_cost_entries'::regclass and conname='work_order_cost_entries_company_rate_version_fk') then
    alter table public.work_order_cost_entries add constraint work_order_cost_entries_company_rate_version_fk foreign key (company_id, rate_version_id) references public.rate_versions(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.work_order_cost_entries'::regclass and conname='work_order_cost_entries_company_concept_fk') then
    alter table public.work_order_cost_entries add constraint work_order_cost_entries_company_concept_fk foreign key (company_id, concept_id) references public.rate_catalog(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.quote_lines'::regclass and conname='quote_lines_company_rate_version_fk') then
    alter table public.quote_lines add constraint quote_lines_company_rate_version_fk foreign key (company_id, rate_version_id) references public.rate_versions(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.quote_lines'::regclass and conname='quote_lines_company_concept_fk') then
    alter table public.quote_lines add constraint quote_lines_company_concept_fk foreign key (company_id, concept_id) references public.rate_catalog(company_id, id);
  end if;
end $$;

-- Canonical view replacement. The original column order is retained and the new
-- separated values are appended for existing consumers.
create or replace view public.v_work_order_economic_summary
with (security_invoker = true) as
with mat as (
  select company_id, work_order_id, round(coalesce(sum(total_cost),0),2) material_cost,
    round(coalesce(sum(total_price),0),2) material_sale from public.work_order_materials
  where deleted_at is null group by company_id, work_order_id
), tim as (
  select company_id, work_order_id, round(coalesce(sum(total_cost),0),2) time_cost,
    round(coalesce(sum(total_price),0),2) time_sale from public.work_order_time_entries group by company_id, work_order_id
), aux as (
  select company_id, work_order_id, round(coalesce(sum(total_cost),0),2) auxiliary_cost,
    round(coalesce(sum(total_price),0),2) auxiliary_sale,
    round(coalesce(sum(total_cost) filter (where cost_type='desplazamiento'),0),2) travel_cost,
    round(coalesce(sum(total_cost) filter (where cost_type='taller_movil'),0),2) mobile_workshop_cost,
    round(coalesce(sum(total_cost) filter (where cost_type='plataforma_elevadora'),0),2) platform_cost,
    round(coalesce(sum(total_cost) filter (where cost_type='coste_externo'),0),2) external_cost,
     round(coalesce(sum(total_price) filter (where source='additional' and contributes_to_sale),0),2) additional_sale_amount
  from public.work_order_cost_entries where deleted_at is null group by company_id, work_order_id
), quoted as (
  select distinct on (wo.company_id, wo.id) wo.company_id, wo.id work_order_id,
    round(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0),2) quoted_sale_amount
  from public.work_orders wo join public.quotes q
    on q.company_id = wo.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente')
    and (q.id = wo.quote_id or q.work_order_id = wo.id)
  order by wo.company_id, wo.id, case when q.id = wo.quote_id then 0 else 1 end, q.updated_at desc, q.id desc
), base as (
  select wo.*, c.legal_name client_name, s.name site_name, e.code equipment_code,
    coalesce(mat.material_cost,0) material_cost, coalesce(tim.time_cost,0) time_cost,
    coalesce(aux.auxiliary_cost,0) auxiliary_cost, coalesce(aux.travel_cost,0) travel_cost,
    coalesce(aux.mobile_workshop_cost,0) mobile_workshop_cost, coalesce(aux.platform_cost,0) platform_cost,
    coalesce(aux.external_cost,0) external_cost,
    round(coalesce(q.quoted_sale_amount,0),2) quoted_calc,
    round(coalesce(aux.additional_sale_amount,0),2) additional_calc
  from public.work_orders wo left join public.clients c on c.id=wo.client_id and c.company_id=wo.company_id
    left join public.sites s on s.id=wo.site_id and s.company_id=wo.company_id
    left join public.equipment e on e.id=wo.main_equipment_id and e.company_id=wo.company_id
    left join mat on mat.company_id=wo.company_id and mat.work_order_id=wo.id
    left join tim on tim.company_id=wo.company_id and tim.work_order_id=wo.id
    left join aux on aux.company_id=wo.company_id and aux.work_order_id=wo.id
    left join quoted q on q.company_id=wo.company_id and q.work_order_id=wo.id
  where wo.deleted_at is null
), calc as (
  select b.*, round(b.material_cost+b.time_cost+b.auxiliary_cost,2) real_cost_calc,
     case when b.warranty or not b.billable or b.economic_status in ('garantia','no_facturable') then 0 else b.quoted_calc+b.additional_calc end sale_calc
  from base b
)
select id, company_id, code, title, status, type, scheduled_date, client_id, client_name, site_id, site_name,
  main_equipment_id, equipment_code, economic_status, billable, warranty, material_cost, time_cost, auxiliary_cost,
  travel_cost, mobile_workshop_cost, platform_cost, external_cost, real_cost_calc as real_cost_amount,
  sale_calc as estimated_sale_amount, round(sale_calc-real_cost_calc,2) estimated_margin_amount, invoiced_amount, paid_amount,
  sale_calc as sale_amount, round(sale_calc-real_cost_calc,2) margin_amount,
  case when sale_calc > 0 then round((sale_calc-real_cost_calc)/sale_calc*100,2) else null end margin_percentage,
  real_cost_calc as real_cost, quoted_calc as quoted_sale_amount, additional_calc as additional_sale_amount, quote_id
from calc;

create or replace view public.v_client_economic_summary
with (security_invoker = true) as
with w as (
  select company_id, client_id, round(sum(real_cost_amount),2) real_cost_amount,
    round(sum(quoted_sale_amount),2) quoted_sale_amount, round(sum(additional_sale_amount),2) additional_sale_amount,
    round(sum(sale_amount),2) sale_amount,
    count(*) filter (where warranty or economic_status='garantia') warranty_work_orders,
    count(*) filter (where billable and economic_status in ('facturable','pendiente_facturar')) billable_work_orders,
    count(*) filter (where economic_status='pendiente_facturar') pending_invoice_work_orders,
    round(sum(real_cost_amount) filter (where warranty or economic_status='garantia'),2) warranty_cost
  from public.v_work_order_economic_summary where client_id is not null group by company_id, client_id
), q as (
  select q.company_id, q.client_id, round(sum(case when wo.id is not null and (wo.warranty or not wo.billable or wo.economic_status in ('garantia','no_facturable')) then 0 else coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0) end),2) quoted_sale_amount,
     round(sum(coalesce(q.total_amount,q.total,0)),2) quote_total_amount, round(sum(coalesce(q.tax_amount,0)),2) quote_tax_amount,
     count(*) filter (where q.status='Aceptado') accepted_quotes, count(*) filter (where q.status='Ejecutado en cliente') executed_quotes
   from public.quotes q left join public.work_orders wo on wo.company_id=q.company_id and (wo.quote_id=q.id or wo.id=q.work_order_id) and wo.deleted_at is null
  where q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') group by q.company_id, q.client_id
), calc as (
  select c.*, coalesce(w.real_cost_amount,0) real_cost_amount, coalesce(q.quoted_sale_amount, w.quoted_sale_amount,0) quoted_sale_amount,
    coalesce(w.additional_sale_amount,0) additional_sale_amount, coalesce(q.quote_total_amount,0) quote_total_amount,
    coalesce(q.quote_tax_amount,0) quote_tax_amount, coalesce(q.accepted_quotes,0) accepted_quotes, coalesce(q.executed_quotes,0) executed_quotes,
    coalesce(w.warranty_work_orders,0) warranty_work_orders, coalesce(w.billable_work_orders,0) billable_work_orders,
    coalesce(w.pending_invoice_work_orders,0) pending_invoice_work_orders, coalesce(w.warranty_cost,0) warranty_cost
  from public.clients c left join w on w.company_id=c.company_id and w.client_id=c.id left join q on q.company_id=c.company_id and q.client_id=c.id
  where c.deleted_at is null
)
select id, company_id, code, legal_name, real_cost_amount,
  round(quoted_sale_amount+additional_sale_amount,2) estimated_sale_amount,
  round(quoted_sale_amount+additional_sale_amount-real_cost_amount,2) estimated_margin_amount,
  warranty_work_orders, billable_work_orders, pending_invoice_work_orders, quoted_sale_amount as quote_sale_amount,
  quote_total_amount, accepted_quotes, executed_quotes, round(quoted_sale_amount+additional_sale_amount,2) sale_amount,
  round(quoted_sale_amount+additional_sale_amount-real_cost_amount,2) margin_amount,
  case when quoted_sale_amount+additional_sale_amount > 0 then round((quoted_sale_amount+additional_sale_amount-real_cost_amount)/(quoted_sale_amount+additional_sale_amount)*100,2) else null end margin_percentage,
  warranty_cost, quote_tax_amount, real_cost_amount as real_cost, quoted_sale_amount, additional_sale_amount
from calc;

create or replace view public.v_management_metrics
with (security_invoker = true) as
with clients_count as (select company_id, count(*) clients from public.clients where deleted_at is null group by company_id),
equipment_count as (select company_id, count(*) equipment from public.equipment where deleted_at is null group by company_id),
w as (select company_id, count(*) work_orders, count(*) filter (where scheduled_date >= date_trunc('month', current_date)::date) work_orders_this_month,
  count(*) filter (where status in ('Finalizado tecnicamente','Enviado','Cerrado')) finished_work_orders,
  count(*) filter (where economic_status='pendiente_facturar' or (status in ('Finalizado tecnicamente','Enviado','Cerrado') and coalesce(invoiced_amount,0)=0 and not warranty)) pending_invoice_work_orders,
  round(sum(real_cost_amount) filter (where warranty or economic_status='garantia'),2) warranty_cost, round(sum(real_cost_amount),2) real_cost,
  round(sum(quoted_sale_amount),2) quoted_sale_amount, round(sum(additional_sale_amount),2) additional_sale_amount
  from public.v_work_order_economic_summary group by company_id),
q as (select q.company_id, count(*) filter (where q.status='Aceptado') accepted_quotes, count(*) filter (where q.status='Ejecutado en cliente') executed_quotes,
  round(sum(case when wo.id is not null and (wo.warranty or not wo.billable or wo.economic_status in ('garantia','no_facturable')) then 0 else coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0) end),2) quoted_sale_amount, round(sum(coalesce(q.tax_amount,0)),2) tax_amount, round(sum(coalesce(q.total_amount,q.total,0)),2) total_amount
  from public.quotes q left join public.work_orders wo on wo.company_id=q.company_id and (wo.quote_id=q.id or wo.id=q.work_order_id) and wo.deleted_at is null
  where q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') group by q.company_id)
select c.id company_id, coalesce(cc.clients,0) clients, coalesce(ec.equipment,0) equipment, coalesce(w.work_orders_this_month,0) work_orders_this_month,
  coalesce(q.accepted_quotes,0) accepted_quotes, coalesce(q.quoted_sale_amount,0) accepted_quote_amount, coalesce(w.work_orders,0) work_orders,
  coalesce(w.finished_work_orders,0) finished_work_orders, coalesce(w.warranty_cost,0) warranty_cost, coalesce(w.pending_invoice_work_orders,0) pending_invoice_work_orders,
  coalesce(q.executed_quotes,0) executed_quotes, round(coalesce(q.quoted_sale_amount,0)+coalesce(w.additional_sale_amount,0),2) sale_amount,
  coalesce(q.tax_amount,0) tax_amount, coalesce(q.total_amount,0) total_amount, coalesce(w.real_cost,0) real_cost,
  round(coalesce(q.quoted_sale_amount,0)+coalesce(w.additional_sale_amount,0)-coalesce(w.real_cost,0),2) margin_amount,
  case when coalesce(q.quoted_sale_amount,0)+coalesce(w.additional_sale_amount,0)>0 then round((coalesce(q.quoted_sale_amount,0)+coalesce(w.additional_sale_amount,0)-coalesce(w.real_cost,0))/(coalesce(q.quoted_sale_amount,0)+coalesce(w.additional_sale_amount,0))*100,2) else null end margin_percentage,
  coalesce(q.quoted_sale_amount,0) quoted_sale_amount, coalesce(w.additional_sale_amount,0) additional_sale_amount
from public.companies c left join clients_count cc on cc.company_id=c.id left join equipment_count ec on ec.company_id=c.id left join w on w.company_id=c.id left join q on q.company_id=c.id;

-- 059 source remains authoritative. cost_type is retained as a legacy display/code field,
-- but new concepts are selected by catalog id instead of a rigid CHECK list.
alter table public.work_order_cost_entries drop constraint if exists work_order_cost_entries_cost_type_check;
alter table public.work_order_cost_entries drop constraint if exists work_order_cost_entries_cost_type_check1;

insert into public.rate_catalog(company_id, code, name, kind, classification, unit, billing_mode, notes)
select c.id, x.code, x.name, 'cost', 'cost', 'ud', 'unit', 'Concepto legacy conservado por migracion 060'
from public.companies c
cross join (values
  ('desplazamiento','Desplazamiento'), ('taller_movil','Taller movil'),
  ('plataforma_elevadora','Plataforma elevadora'), ('medio_auxiliar','Medio auxiliar'),
  ('coste_externo','Coste externo'), ('parking_peaje','Parking o peaje'),
  ('dieta','Dieta'), ('otro','Otro'), ('pemp','PEMP'), ('grua','Grua')
) x(code, name)
on conflict (company_id, code) do nothing;

-- PEMP is a period concept; the period length remains a Gerencia setting and
-- no historical duration or amount is reconstructed here.
update public.rate_catalog
set unit='period', billing_mode='period', updated_at=now()
where code='pemp' and classification='cost'
  and (unit is distinct from 'period' or billing_mode is distinct from 'period');

update public.work_order_cost_entries e
set concept_id = r.id, rate_id = coalesce(e.rate_id, r.id)
from public.rate_catalog r
where e.company_id = r.company_id
  and r.kind = 'cost'
  and r.code = e.cost_type
  and e.concept_id is null;

-- Existing cost rows retain their stored economic snapshot. Rows without a reliable
-- catalog/version match are intentionally not recalculated; Gerencia configures the
-- new concept before it can be used for a new entry.

-- Import only explicit hourly-labor categories. Unknown/transport categories become
-- cost placeholders without versions; no invented hourly economics are created.
insert into public.rate_catalog(company_id, code, name, kind, classification, unit, billing_mode, notes)
select h.company_id, 'legacy-hour-' || h.id::text, coalesce(nullif(h.category, ''), 'Tarifa de horas'), 'labor', 'labor', 'h', 'hour', 'Snapshot legacy de technician_hour_rates'
from public.technician_hour_rates h
where h.deleted_at is null and lower(trim(coalesce(h.category, ''))) in ('tecnico','técnico','tecnicos','técnicos','oficial','ayudante','mano de obra','labor','hora','horas')
on conflict (company_id, code) do nothing;
insert into public.rate_versions(company_id, rate_id, technician_profile_id, category, cost_amount, sale_amount, valid_from, valid_to, active, notes)
select h.company_id, r.id, h.technician_profile_id, h.category, h.hourly_cost, h.hourly_price, h.valid_from, h.valid_to, h.active, 'Version importada de 042: categoria horaria explicita'
from public.technician_hour_rates h
join public.rate_catalog r on r.company_id = h.company_id and r.code = 'legacy-hour-' || h.id::text
where h.deleted_at is null and r.classification = 'labor'
  and h.id in (select id from pg_temp.dmp_060_safe_hour_rates)
  and not exists (select 1 from public.rate_versions v where v.rate_id = r.id);
insert into public.rate_catalog(company_id, code, name, kind, classification, unit, billing_mode, notes)
select h.company_id, 'legacy-cost-' || h.id::text, coalesce(nullif(h.category, ''), 'Concepto legacy sin clasificar'), 'cost', 'cost', 'ud', 'unit', 'Placeholder 060: unidad/categoria legacy ambigua; requiere configuracion de Gerencia'
from public.technician_hour_rates h
where h.deleted_at is null and lower(trim(coalesce(h.category, ''))) not in ('tecnico','técnico','tecnicos','técnicos','oficial','ayudante','mano de obra','labor','hora','horas')
on conflict (company_id, code) do nothing;

-- Demonstrable legacy equivalence only: cost line types use exact legacy codes;
-- labor quote_rate_id maps only to explicitly classified hourly labor.
update public.quote_lines ql
set concept_id = rc.id, billing_mode = rc.billing_mode, period_days = rc.period_days
from public.rate_catalog rc
where ql.concept_id is null and rc.classification = 'cost'
  and rc.company_id = ql.company_id
  and rc.code = case ql.line_type when 'transport' then 'desplazamiento' when 'travel' then 'desplazamiento' when 'mobile_workshop' then 'taller_movil' when 'lifting_platform' then 'plataforma_elevadora' when 'auxiliary_equipment' then 'medio_auxiliar' when 'external_cost' then 'coste_externo' when 'other' then 'otro' else null end;
update public.quote_lines ql
set concept_id = rc.id, rate_version_id = rv.id, billing_mode = rc.billing_mode, period_days = rc.period_days
from public.technician_hour_rates h
join public.rate_catalog rc on rc.company_id = h.company_id and rc.code = 'legacy-hour-' || h.id::text and rc.classification = 'labor'
join public.quotes q on q.id = ql.quote_id and q.company_id = ql.company_id
left join lateral (
  select (array_agg(v.id order by case when v.technician_profile_id = ql.profile_id then 0 else 1 end, v.valid_from desc, v.created_at desc))[1] as id
  from public.rate_versions v
  where v.company_id = ql.company_id and v.rate_id = rc.id and v.active and v.deleted_at is null
    and v.valid_from <= coalesce(q.issue_date, current_date)
    and (v.valid_to is null or v.valid_to >= coalesce(q.issue_date, current_date))
    and (v.technician_profile_id = ql.profile_id or v.technician_profile_id is null)
  having count(*) = 1
) rv on true
where ql.concept_id is null and ql.quote_rate_id = h.id and rv.id is not null;

alter table public.rate_catalog enable row level security;
alter table public.rate_versions enable row level security;
drop policy if exists rate_catalog_select_scoped on public.rate_catalog;
create policy rate_catalog_select_scoped on public.rate_catalog for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina','SAT','Tecnico','Comercial']));
drop policy if exists rate_catalog_write_management on public.rate_catalog;
create policy rate_catalog_write_management on public.rate_catalog for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
drop policy if exists rate_catalog_update_management on public.rate_catalog;
create policy rate_catalog_update_management on public.rate_catalog for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
drop policy if exists rate_catalog_no_delete on public.rate_catalog;
create policy rate_catalog_no_delete on public.rate_catalog for delete to authenticated using (false);
drop policy if exists rate_versions_select_scoped on public.rate_versions;
create policy rate_versions_select_scoped on public.rate_versions for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
drop policy if exists rate_versions_write_management on public.rate_versions;
create policy rate_versions_write_management on public.rate_versions for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
drop policy if exists rate_versions_update_management on public.rate_versions;
create policy rate_versions_update_management on public.rate_versions for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
drop policy if exists rate_versions_no_delete on public.rate_versions;
create policy rate_versions_no_delete on public.rate_versions for delete to authenticated using (false);

-- Selectors need metadata and a usable-version marker, never economic amounts.
create or replace function public.dmp_rate_catalog_for_selection(p_kind text default 'cost')
returns table(id uuid, company_id uuid, code text, name text, kind text, classification text,
  unit text, billing_mode text, period_days integer, contributes_to_sale boolean, rate_version_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.company_id, c.code, c.name, c.kind, c.classification, c.unit, c.billing_mode,
    c.period_days, c.contributes_to_sale, v.id
  from public.rate_catalog c
  left join lateral (
    select rv.id
    from public.rate_versions rv
    where rv.rate_id = c.id and rv.active and rv.deleted_at is null
      and rv.valid_from <= current_date and (rv.valid_to is null or rv.valid_to >= current_date)
      and rv.technician_profile_id is null
    order by rv.valid_from desc, rv.created_at desc limit 1
  ) v on true
  where c.company_id = public.current_company_id() and c.active and c.deleted_at is null
    and (p_kind is null or c.kind = p_kind) and (p_kind is null or c.classification = p_kind)
    and (v.id is not null or c.kind = 'cost');
$$;

create or replace function public.dmp_resolve_rate(p_rate_id uuid, p_profile_id uuid, p_work_date date)
returns table(rate_id uuid, rate_version_id uuid, cost_amount numeric, sale_amount numeric, unit text, billing_mode text, period_days integer, contributes_to_sale boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_specific_count integer;
  v_generic_count integer;
begin
  select count(*) into v_specific_count
  from public.rate_versions v
  where v.company_id = public.current_company_id()
    and v.rate_id = p_rate_id
    and p_profile_id is not null
    and v.technician_profile_id = p_profile_id
    and v.deleted_at is null and v.active
    and v.valid_from <= coalesce(p_work_date, current_date)
    and (v.valid_to is null or v.valid_to >= coalesce(p_work_date, current_date));

  if v_specific_count > 1 then
    raise exception 'tarifa: existen varias versiones vigentes para el concepto y fecha indicados; Gerencia debe corregir la configuracion tarifaria';
  end if;

  if v_specific_count = 0 then
    select count(*) into v_generic_count
    from public.rate_versions v
    where v.company_id = public.current_company_id()
      and v.rate_id = p_rate_id
      and v.technician_profile_id is null
      and v.deleted_at is null and v.active
      and v.valid_from <= coalesce(p_work_date, current_date)
      and (v.valid_to is null or v.valid_to >= coalesce(p_work_date, current_date));

    if v_generic_count > 1 then
      raise exception 'tarifa: existen varias versiones vigentes para el concepto y fecha indicados; Gerencia debe corregir la configuracion tarifaria';
    end if;
  end if;

  return query
  select r.id, v.id, v.cost_amount, v.sale_amount, r.unit, r.billing_mode, r.period_days, r.contributes_to_sale
  from public.rate_catalog r
  join public.rate_versions v on v.rate_id = r.id and v.company_id = r.company_id
  where r.id = p_rate_id
    and r.company_id = public.current_company_id()
    and r.deleted_at is null and r.active
    and v.deleted_at is null and v.active
    and v.valid_from <= coalesce(p_work_date, current_date)
    and (v.valid_to is null or v.valid_to >= coalesce(p_work_date, current_date))
    and ((v_specific_count = 1 and v.technician_profile_id = p_profile_id)
      or (v_specific_count = 0 and v_generic_count = 1 and v.technician_profile_id is null));
end;
$$;

create or replace function public.dmp_rate_version_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.cost_amount, new.sale_amount, new.valid_from, new.valid_to, new.rate_id, new.technician_profile_id)
     is distinct from (old.cost_amount, old.sale_amount, old.valid_from, old.valid_to, old.rate_id, old.technician_profile_id)
     and (
       exists (select 1 from public.work_order_cost_entries where rate_version_id = old.id)
       or exists (select 1 from public.work_order_time_entries where rate_version_id = old.id)
       or exists (select 1 from public.quote_lines where rate_version_id = old.id)
     ) then
    raise exception 'tarifa: no se puede modificar una version ya utilizada; crea una nueva version';
  end if;
  return new;
end;
$$;

drop trigger if exists rate_version_update_guard on public.rate_versions;
create trigger rate_version_update_guard
before update on public.rate_versions
for each row execute function public.dmp_rate_version_update_guard();

-- Historical overlaps remain untouched, but all future writes are serialized and
-- rejected when they overlap an active version in the same company/rate/scope.
create or replace function public.dmp_rate_version_no_overlap_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active and new.deleted_at is null and (tg_op = 'INSERT' or
    (new.rate_id, new.technician_profile_id, new.valid_from, new.valid_to, new.active, new.deleted_at)
      is distinct from (old.rate_id, old.technician_profile_id, old.valid_from, old.valid_to, old.active, old.deleted_at)) then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', new.company_id::text, new.rate_id::text, new.scope_profile_id::text), 0));
    if exists (
      select 1
      from public.rate_versions v
      where v.company_id = new.company_id
        and v.rate_id = new.rate_id
        and v.scope_profile_id = new.scope_profile_id
        and v.id is distinct from new.id
        and v.active and v.deleted_at is null
        and daterange(v.valid_from, coalesce(v.valid_to, '9999-12-31'::date), '[]')
          && daterange(new.valid_from, coalesce(new.valid_to, '9999-12-31'::date), '[]')
    ) then
      raise exception 'tarifa: la version se solapa con otra version activa; ajusta la vigencia o crea una version posterior';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists rate_version_no_overlap_guard on public.rate_versions;
create trigger rate_version_no_overlap_guard
before insert or update on public.rate_versions
for each row execute function public.dmp_rate_version_no_overlap_guard();

create or replace function public.dmp_rate_catalog_classification_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.classification is distinct from old.classification and (
    exists (select 1 from public.rate_versions where rate_id = old.id)
    or exists (select 1 from public.work_order_cost_entries where concept_id = old.id or rate_id = old.id)
    or exists (select 1 from public.work_order_time_entries where rate_id = old.id)
    or exists (select 1 from public.quote_lines where concept_id = old.id)
  ) then
    raise exception 'concepto: no se puede cambiar la clasificacion de un concepto ya utilizado; crea un concepto nuevo';
  end if;
  return new;
end;
$$;
drop trigger if exists rate_catalog_classification_guard on public.rate_catalog;
create trigger rate_catalog_classification_guard
before update on public.rate_catalog
for each row execute function public.dmp_rate_catalog_classification_guard();

-- Cost RPC accepts only concept/rate, quantity and observation fields for economics.
create or replace function public.dmp_upsert_work_order_cost_entry(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_actor public.profiles := public.dmp_active_profile(); v_work public.work_orders; v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_requested uuid := coalesce(nullif(p_payload->>'concept_id','')::uuid,nullif(p_payload->>'rate_id','')::uuid);
  v_concept uuid; v_rate record; v_type text; v_quantity numeric := coalesce(nullif(p_payload->>'quantity','')::numeric,1);
  v_additional boolean := coalesce((p_payload->>'additional_to_planned')::boolean,false); v_old public.work_order_cost_entries; v_changed boolean := false;
begin
  v_work := public.dmp_assert_work_order_operator((p_payload->>'work_order_id')::uuid,false);
  if v_id is not null then
    select * into v_old from public.work_order_cost_entries where id=v_id and company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null for update;
    if v_old.id is null or not (v_old.registered_by=v_actor.id or public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])) then raise exception 'Recurso o coste no editable'; end if;
  end if;
  if v_requested is not null then
    if not exists (select 1 from public.rate_catalog where id=v_requested and company_id=v_work.company_id and classification='cost' and active and deleted_at is null) then raise exception 'concepto: concept_id no es un concepto de coste valido'; end if;
    v_concept := v_requested;
  elsif v_old.id is not null then
    v_concept := coalesce(v_old.concept_id,v_old.rate_id);
  else
    v_type := coalesce(nullif(p_payload->>'cost_type',''),'otro');
    select id into v_concept from public.rate_catalog where company_id=v_work.company_id and code=v_type and classification='cost' and active and deleted_at is null limit 1;
    if v_concept is null then raise exception 'concepto: cost_type legacy no reconocido; selecciona un concepto de catalogo'; end if;
  end if;
  select code into v_type from public.rate_catalog where id=v_concept and company_id=v_work.company_id;
  v_changed := v_id is null or v_requested is not null and v_requested is distinct from coalesce(v_old.concept_id,v_old.rate_id);
  if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if not v_additional and v_id is null and exists(select 1 from public.work_order_cost_entries where work_order_id=v_work.id and concept_id=v_concept and quote_line_id is not null and deleted_at is null) then raise exception 'adicional: este concepto procedente del presupuesto ya esta contabilizado'; end if;
  if not v_additional and v_id is null and exists(select 1 from public.work_order_cost_entries where work_order_id=v_work.id and (((source='quote') and (concept_id=v_concept or rate_id=v_concept or cost_type=v_type)) or (source is null and quote_line_id is not null and cost_type=v_type)) and deleted_at is null) then raise exception 'adicional: este concepto procedente del presupuesto ya esta contabilizado'; end if;
  if v_changed then
    select * into v_rate from public.dmp_resolve_rate(v_concept,v_actor.id,coalesce(nullif(p_payload->>'incurred_at','')::date,current_date));
    if v_rate.rate_version_id is null then raise exception 'tarifa: el concepto no tiene una version vigente configurada por Gerencia'; end if;
  else
    v_rate.rate_id := v_old.rate_id; v_rate.rate_version_id := v_old.rate_version_id; v_rate.cost_amount := v_old.unit_cost; v_rate.sale_amount := v_old.unit_price; v_rate.unit := v_old.unit; v_rate.billing_mode := v_old.billing_mode; v_rate.period_days := v_old.period_days; v_rate.contributes_to_sale := v_old.contributes_to_sale;
  end if;
  if v_id is not null then
    update public.work_order_cost_entries set concept_id=case when v_changed then v_concept else v_old.concept_id end, rate_id=v_rate.rate_id, rate_version_id=v_rate.rate_version_id, cost_type=case when v_changed then v_type else v_old.cost_type end, description=coalesce(nullif(trim(p_payload->>'description'),''),v_old.description), quantity=v_quantity, unit=v_rate.unit, unit_cost=v_rate.cost_amount, unit_price=v_rate.sale_amount, total_cost=round(v_quantity*v_rate.cost_amount,2), total_price=round(v_quantity*v_rate.sale_amount,2), billing_mode=v_rate.billing_mode, period_days=v_rate.period_days, contributes_to_sale=v_rate.contributes_to_sale, updated_at=now(),updated_by=v_actor.id where id=v_id;
    return v_id;
  end if;
  insert into public.work_order_cost_entries(company_id,work_order_id,concept_id,rate_id,rate_version_id,cost_type,description,quantity,unit,unit_cost,unit_price,total_cost,total_price,billing_mode,period_days,contributes_to_sale,incurred_at,registered_by,updated_by,source,local_change_id)
  values(v_work.company_id,v_work.id,v_concept,v_rate.rate_id,v_rate.rate_version_id,v_type,trim(coalesce(p_payload->>'description',v_type)),v_quantity,v_rate.unit,v_rate.cost_amount,v_rate.sale_amount,round(v_quantity*v_rate.cost_amount,2),round(v_quantity*v_rate.sale_amount,2),v_rate.billing_mode,v_rate.period_days,v_rate.contributes_to_sale,coalesce(nullif(p_payload->>'incurred_at','')::date,current_date),v_actor.id,v_actor.id,case when v_additional then 'additional' else 'manual' end,nullif(p_payload->>'local_change_id','')) returning id into v_id;
  return v_id;
end $$;

-- Confirming a planned quote line always keeps the quote's stored price/cost snapshot.
create or replace function public.dmp_quote_line_cost_snapshot_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_line public.quote_lines; v_catalog uuid; v_billing text; v_period integer;
begin
  if new.quote_line_id is not null then
    select * into v_line from public.quote_lines where id = new.quote_line_id;
    if v_line.id is not null then
      new.unit_cost := coalesce(v_line.unit_cost, 0);
      new.unit_price := coalesce(v_line.unit_price, 0);
      new.total_cost := round(coalesce(new.quantity,0) * new.unit_cost, 2);
      new.total_price := round(coalesce(new.quantity,0) * new.unit_price, 2);
      new.rate_version_id := coalesce(new.rate_version_id, v_line.rate_version_id);
       select id into v_catalog from public.rate_catalog where company_id = new.company_id and code = new.cost_type and classification = 'cost' and deleted_at is null limit 1;
       new.concept_id := coalesce(new.concept_id, v_line.concept_id, v_catalog);
       new.rate_id := coalesce(new.rate_id, new.concept_id);
       select rc.billing_mode, rc.period_days into v_billing, v_period from public.rate_catalog rc where rc.id = new.rate_id;
        new.billing_mode := v_billing; new.period_days := v_period; new.contributes_to_sale := coalesce(v_line.contributes_to_sale,false);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists work_order_cost_quote_snapshot_trigger on public.work_order_cost_entries;
create trigger work_order_cost_quote_snapshot_trigger before insert or update on public.work_order_cost_entries for each row execute function public.dmp_quote_line_cost_snapshot_trigger();

-- A generic quote line carries the selected catalog version, not a future lookup.
create or replace function public.dmp_quote_line_rate_snapshot_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quote public.quotes; v_catalog public.rate_catalog; v_version public.rate_versions; v_count integer;
begin
  if new.concept_id is null then return new; end if;
  select * into v_quote from public.quotes where id=new.quote_id and company_id=new.company_id;
  select * into v_catalog from public.rate_catalog where id=new.concept_id and company_id=new.company_id and active and deleted_at is null;
  if v_catalog.id is null then raise exception 'concepto: concept_id no pertenece al catalogo activo de la empresa'; end if;
  if new.rate_version_id is null then
    select count(*) into v_count from public.rate_versions v where v.rate_id=v_catalog.id and v.active and v.deleted_at is null
      and v.valid_from <= coalesce(v_quote.issue_date,current_date) and (v.valid_to is null or v.valid_to >= coalesce(v_quote.issue_date,current_date));
    if v_count <> 1 then raise exception 'tarifa: linea historica sin una unica version vigente; no se inventa relacion'; end if;
    select * into v_version from public.rate_versions v where v.rate_id=v_catalog.id and v.active and v.deleted_at is null
      and v.valid_from <= coalesce(v_quote.issue_date,current_date) and (v.valid_to is null or v.valid_to >= coalesce(v_quote.issue_date,current_date)) order by v.valid_from desc limit 1;
  else
    select * into v_version from public.rate_versions v where v.id=new.rate_version_id and v.rate_id=v_catalog.id
      and v.valid_from <= coalesce(v_quote.issue_date,current_date) and (v.valid_to is null or v.valid_to >= coalesce(v_quote.issue_date,current_date));
    if v_version.id is null then raise exception 'tarifa: rate_version_id no es valida para la fecha del presupuesto'; end if;
  end if;
  new.rate_version_id := v_version.id; new.unit := v_catalog.unit; new.billing_mode := v_catalog.billing_mode; new.period_days := v_catalog.period_days; new.contributes_to_sale := v_catalog.contributes_to_sale;
  new.unit_cost := v_version.cost_amount; new.unit_price := v_version.sale_amount;
  new.total_cost := round(coalesce(new.quantity,0)*new.unit_cost,2); new.total_price := round(coalesce(new.quantity,0)*new.unit_price*(1-coalesce(new.discount_percent,0)/100),2);
  return new;
end $$;
drop trigger if exists quote_line_rate_snapshot_trigger on public.quote_lines;
create trigger quote_line_rate_snapshot_trigger before insert or update on public.quote_lines for each row execute function public.dmp_quote_line_rate_snapshot_trigger();

-- Effective hour RPC: only classified labor rates may resolve, and edits without
-- an explicit rate keep the original snapshot instead of refreshing it.
create or replace function public.dmp_upsert_work_order_time_entry(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp025_actor_profile(); v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id','')::uuid; v_profile uuid := coalesce(nullif(p_payload->>'profile_id','')::uuid,v_actor.id);
  v_date date := coalesce(nullif(p_payload->>'work_date','')::date,current_date); v_duration integer;
  v_requested uuid := nullif(p_payload->>'rate_id','')::uuid; v_rate record; v_legacy record; v_old public.work_order_time_entries;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
begin
  v_work := public.dmp025_assert_time_target((p_payload->>'work_order_id')::uuid,v_profile);
  v_duration := public.dmp024_work_minutes(nullif(p_payload->>'started_at','')::time,nullif(p_payload->>'ended_at','')::time,coalesce(nullif(p_payload->>'break_minutes','')::integer,0),nullif(p_payload->>'duration_minutes','')::integer);
  if v_id is not null then
    select * into v_old from public.work_order_time_entries where id=v_id and company_id=v_work.company_id and work_order_id=v_work.id for update;
    if v_old.id is null or not (v_admin or v_old.created_by=v_actor.id) then raise exception 'permiso: registro de horas no editable para este usuario'; end if;
  end if;
  if v_id is not null and v_requested is null then
    v_rate.rate_id := v_old.rate_id; v_rate.rate_version_id := v_old.rate_version_id; v_rate.cost_amount := v_old.hourly_cost; v_rate.sale_amount := v_old.hourly_price; v_rate.unit := 'h'; v_rate.billing_mode := 'hour'; v_rate.period_days := null;
  else
    if v_requested is not null then
      if not exists (select 1 from public.rate_catalog c where c.id=v_requested and c.company_id=v_work.company_id and c.classification='labor' and c.active and c.deleted_at is null) then raise exception 'tarifa: rate_id no es una tarifa laboral valida'; end if;
      select * into v_rate from public.dmp_resolve_rate(v_requested,v_profile,v_date);
      if v_rate.rate_version_id is null then raise exception 'tarifa: no existe una version laboral vigente'; end if;
    else
      select r.* into v_legacy from public.dmp_current_hour_rate(v_work.company_id,v_profile,v_date) r;
       select c.id as rate_id, v.id as rate_version_id, v.cost_amount, v.sale_amount, c.unit, c.billing_mode, c.period_days
         into v_rate from public.rate_catalog c join public.rate_versions v on v.rate_id=c.id
         where c.company_id=v_work.company_id and c.code='legacy-hour-' || v_legacy.rate_id::text and c.classification='labor'
           and c.active and c.deleted_at is null
           and v.active and v.deleted_at is null and v.valid_from <= v_date and (v.valid_to is null or v.valid_to >= v_date)
         order by v.valid_from desc limit 1;
    end if;
  end if;
   if v_rate.rate_version_id is null then raise exception 'tarifa: no existe una tarifa horaria vigente aplicable al tecnico para la fecha indicada'; end if;
  if v_id is not null then
    update public.work_order_time_entries set profile_id=v_profile, work_date=v_date,
      started_at=nullif(p_payload->>'started_at','')::time, ended_at=nullif(p_payload->>'ended_at','')::time,
      break_minutes=coalesce(nullif(p_payload->>'break_minutes','')::integer,0), duration_minutes=v_duration,
      manual_duration=nullif(p_payload->>'started_at','') is null, hour_type=coalesce(nullif(p_payload->>'hour_type',''),'normal'),
      hourly_cost=coalesce(v_rate.cost_amount,0), hourly_price=coalesce(v_rate.sale_amount,0),
      total_cost=round(v_duration::numeric/60*coalesce(v_rate.cost_amount,0),2), total_price=round(v_duration::numeric/60*coalesce(v_rate.sale_amount,0),2),
      description=trim(coalesce(p_payload->>'description','')), rate_id=v_rate.rate_id, rate_version_id=v_rate.rate_version_id,
      billing_mode=v_rate.billing_mode, period_days=v_rate.period_days, updated_by=v_actor.id, updated_at=now() where id=v_id;
    return v_id;
  end if;
  insert into public.work_order_time_entries(company_id,work_order_id,profile_id,work_date,started_at,ended_at,break_minutes,duration_minutes,manual_duration,hour_type,hourly_cost,hourly_price,total_cost,total_price,description,created_by,updated_by,rate_id,rate_version_id,billing_mode,period_days)
  values(v_work.company_id,v_work.id,v_profile,v_date,nullif(p_payload->>'started_at','')::time,nullif(p_payload->>'ended_at','')::time,coalesce(nullif(p_payload->>'break_minutes','')::integer,0),v_duration,nullif(p_payload->>'started_at','') is null,coalesce(nullif(p_payload->>'hour_type',''),'normal'),coalesce(v_rate.cost_amount,0),coalesce(v_rate.sale_amount,0),round(v_duration::numeric/60*coalesce(v_rate.cost_amount,0),2),round(v_duration::numeric/60*coalesce(v_rate.sale_amount,0),2),trim(coalesce(p_payload->>'description','')),v_actor.id,v_actor.id,v_rate.rate_id,v_rate.rate_version_id,v_rate.billing_mode,v_rate.period_days) returning id into v_id;
  return v_id;
end $$;

-- Effective cost RPC: invalid IDs fail; omitted economics preserve an existing
-- snapshot; an explicit concept change resolves a fresh catalog version.
create or replace function public.dmp_upsert_work_order_cost_entry(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp_active_profile(); v_work public.work_orders; v_old public.work_order_cost_entries;
  v_id uuid := nullif(p_payload->>'id','')::uuid; v_requested uuid := coalesce(nullif(p_payload->>'concept_id','')::uuid,nullif(p_payload->>'rate_id','')::uuid);
  v_concept uuid; v_type text; v_rate record; v_quantity numeric := coalesce(nullif(p_payload->>'quantity','')::numeric,1);
  v_additional boolean := coalesce((p_payload->>'additional_to_planned')::boolean,false); v_changed boolean := false;
begin
  v_work := public.dmp_assert_work_order_operator((p_payload->>'work_order_id')::uuid,false);
  if v_id is not null then
    select * into v_old from public.work_order_cost_entries where id=v_id and company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null for update;
    if v_old.id is null or not (v_old.registered_by=public.current_profile_id() or public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])) then raise exception 'Recurso o coste no editable'; end if;
  end if;
  if v_requested is not null then
    if not exists (select 1 from public.rate_catalog c where c.id=v_requested and c.company_id=v_work.company_id and c.classification='cost' and c.active and c.deleted_at is null) then raise exception 'concepto: concept_id no es un concepto de coste valido'; end if;
    v_concept := v_requested; v_changed := v_old.id is null or v_requested is distinct from coalesce(v_old.concept_id,v_old.rate_id);
  elsif v_old.id is not null then
    v_concept := coalesce(v_old.concept_id,v_old.rate_id);
  else
    v_type := coalesce(nullif(p_payload->>'cost_type',''),'otro');
    select id into v_concept from public.rate_catalog where company_id=v_work.company_id and code=v_type and classification='cost' and deleted_at is null limit 1;
    if v_concept is null then raise exception 'concepto: cost_type legacy no reconocido; selecciona un concepto de catalogo'; end if;
  end if;
  if v_concept is not null then select code into v_type from public.rate_catalog where id=v_concept; end if;
  if not v_additional and v_id is null and exists (select 1 from public.work_order_cost_entries e where e.work_order_id=v_work.id and (((e.source='quote') and (e.concept_id=v_concept or e.rate_id=v_concept or e.cost_type=v_type)) or (e.source is null and e.quote_line_id is not null and e.cost_type=v_type)) and e.deleted_at is null) then raise exception 'adicional: este concepto procedente del presupuesto ya esta contabilizado'; end if;
  if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if v_changed or v_id is null then
    select * into v_rate from public.dmp_resolve_rate(v_concept,public.current_profile_id(),coalesce(nullif(p_payload->>'incurred_at','')::date,current_date));
    if v_rate.rate_version_id is null then raise exception 'tarifa: el concepto no tiene una version vigente configurada por Gerencia'; end if;
  else
     v_rate.rate_id := v_old.rate_id; v_rate.rate_version_id := v_old.rate_version_id; v_rate.cost_amount := v_old.unit_cost; v_rate.sale_amount := v_old.unit_price; v_rate.unit := v_old.unit; v_rate.billing_mode := v_old.billing_mode; v_rate.period_days := v_old.period_days; v_rate.contributes_to_sale := v_old.contributes_to_sale;
  end if;
  if v_id is not null then
     update public.work_order_cost_entries set concept_id=case when v_changed then v_concept else v_old.concept_id end, rate_id=v_rate.rate_id, rate_version_id=v_rate.rate_version_id, cost_type=case when v_changed then v_type else v_old.cost_type end, description=coalesce(nullif(trim(p_payload->>'description'),''),v_old.description), quantity=v_quantity, unit=v_rate.unit, unit_cost=v_rate.cost_amount, unit_price=v_rate.sale_amount, total_cost=round(v_quantity*v_rate.cost_amount,2), total_price=round(v_quantity*v_rate.sale_amount,2), billing_mode=v_rate.billing_mode, period_days=v_rate.period_days, contributes_to_sale=v_rate.contributes_to_sale, updated_by=public.current_profile_id(), updated_at=now() where id=v_id;
    return v_id;
  end if;
   insert into public.work_order_cost_entries(company_id,work_order_id,concept_id,rate_id,rate_version_id,cost_type,description,quantity,unit,unit_cost,unit_price,total_cost,total_price,billing_mode,period_days,contributes_to_sale,incurred_at,registered_by,updated_by,source,local_change_id)
   values(v_work.company_id,v_work.id,v_concept,v_rate.rate_id,v_rate.rate_version_id,v_type,coalesce(nullif(trim(p_payload->>'description'),''),v_type),v_quantity,v_rate.unit,v_rate.cost_amount,v_rate.sale_amount,round(v_quantity*v_rate.cost_amount,2),round(v_quantity*v_rate.sale_amount,2),v_rate.billing_mode,v_rate.period_days,v_rate.contributes_to_sale,coalesce(nullif(p_payload->>'incurred_at','')::date,current_date),public.current_profile_id(),public.current_profile_id(),case when v_additional then 'additional' else 'manual' end,nullif(p_payload->>'local_change_id','')) returning id into v_id;
  return v_id;
end $$;

-- Final technical close persists the complete economic snapshot. Open parts use
-- current quote data in the view; finalized/closed parts use these columns only.
create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb;
  v_real_cost numeric := 0; v_quote numeric := 0; v_additional numeric := 0; v_sale numeric := 0; v_margin numeric := 0;
  v_billable boolean; v_warranty boolean; v_economic_status text;
begin
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico', v_work.status; end if;
  if not (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or (public.has_any_role(array['Tecnico']) and exists (select 1 from public.work_order_assignments a where a.work_order_id=v_work.id and a.technician_id=v_actor.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado'))) or (public.has_any_role(array['Comercial']) and public.dmp024_can_commercial_operate(v_work,v_actor))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;
  v_old := to_jsonb(v_work);
  select round(coalesce(sum(total_cost),0),2) into v_real_cost from (
    select total_cost from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
    union all select total_cost from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
    union all select total_cost from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
  ) x;
  select round(coalesce(taxable_base,subtotal_sale,subtotal,0),2) into v_quote from public.quotes
    where company_id=v_work.company_id and deleted_at is null and status in ('Aceptado','Ejecutado en cliente')
      and (id=v_work.quote_id or work_order_id=v_work.id)
    order by case when id=v_work.quote_id then 0 else 1 end, issue_date desc nulls last, created_at desc nulls last, id desc limit 1;
  select round(coalesce(sum(total_price) filter (where contributes_to_sale),0),2) into v_additional
    from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source='additional';
  v_warranty := case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean,false) else coalesce(v_work.warranty,false) or v_work.type='Garantia' end;
  v_billable := case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean,true) else coalesce(v_work.billable,true) end;
  if v_warranty then v_billable := false; end if;
  v_economic_status := case when v_warranty then 'garantia' when not v_billable then 'no_facturable' else 'pendiente_facturar' end;
  if v_economic_status in ('garantia','no_facturable') then v_quote := 0; v_additional := 0; end if;
  v_sale := round(v_quote + v_additional,2); v_margin := case when v_economic_status in ('garantia','no_facturable') then 0 else round(v_sale-v_real_cost,2) end;
  update public.work_orders set status='Finalizado tecnicamente', economic_status=v_economic_status, billable=v_billable, warranty=v_warranty,
    quoted_sale_amount=v_quote, additional_sale_amount=v_additional, sale_amount=v_sale, real_cost_amount=v_real_cost,
    margin_amount=v_margin, estimated_sale_amount=v_sale, estimated_margin_amount=v_margin, finished_at=coalesce(finished_at,now()),
    sent_at=null, updated_by=v_actor.id, updated_at=now() where id=v_work.id returning * into v_work;
  update public.work_order_assignments set status='Finalizado', updated_at=now() where work_order_id=v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  if v_old->>'status' is distinct from v_work.status then insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico del parte'),false); end if;
  if v_work.quote_id is not null and exists(select 1 from public.quotes where id=v_work.quote_id and deleted_at is null and status='Aceptado') then
    perform public.dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente',coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico del parte'),null,v_actor.id);
    update public.quotes set work_order_id=coalesce(work_order_id,v_work.id) where id=v_work.quote_id;
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
    values(v_work.company_id,'work_orders',v_work.id,'TECHNICAL_FINALIZE',v_actor.id,v_old,jsonb_build_object('status',v_work.status,'quoted_sale_amount',v_work.quoted_sale_amount,'additional_sale_amount',v_work.additional_sale_amount,'sale_amount',v_work.sale_amount,'real_cost_amount',v_work.real_cost_amount,'margin_amount',v_work.margin_amount));
  return v_work;
end $$;

-- One canonical economic view; consumers cannot use a second formula.
create or replace view public.v_work_order_economic_summary with (security_invoker=true) as
with mat as (select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) material_cost from public.work_order_materials where deleted_at is null group by company_id,work_order_id),
tim as (select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) time_cost from public.work_order_time_entries group by company_id,work_order_id),
aux as (select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) auxiliary_cost,round(coalesce(sum(total_cost) filter(where cost_type='desplazamiento'),0),2) travel_cost,round(coalesce(sum(total_cost) filter(where cost_type='taller_movil'),0),2) mobile_workshop_cost,round(coalesce(sum(total_cost) filter(where cost_type='plataforma_elevadora'),0),2) platform_cost,round(coalesce(sum(total_cost) filter(where cost_type='coste_externo'),0),2) external_cost,round(coalesce(sum(total_price) filter(where source='additional' and contributes_to_sale),0),2) additional_sale_amount from public.work_order_cost_entries where deleted_at is null group by company_id,work_order_id),
quoted as (select distinct on (wo.company_id,wo.id) wo.company_id,wo.id work_order_id,round(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0),2) quoted_sale_amount from public.work_orders wo join public.quotes q on q.company_id=wo.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') and (q.id=wo.quote_id or q.work_order_id=wo.id) order by wo.company_id,wo.id,case when q.id=wo.quote_id then 0 else 1 end,q.updated_at desc,q.id desc),
base as (select wo.*,c.legal_name client_name,s.name site_name,e.code equipment_code,coalesce(mat.material_cost,0) material_cost,coalesce(tim.time_cost,0) time_cost,coalesce(aux.auxiliary_cost,0) auxiliary_cost,coalesce(aux.travel_cost,0) travel_cost,coalesce(aux.mobile_workshop_cost,0) mobile_workshop_cost,coalesce(aux.platform_cost,0) platform_cost,coalesce(aux.external_cost,0) external_cost,case when wo.status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(wo.quoted_sale_amount,0) else coalesce(quoted.quoted_sale_amount,0) end quoted_calc,case when wo.status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(wo.additional_sale_amount,0) else coalesce(aux.additional_sale_amount,0) end additional_calc from public.work_orders wo left join public.clients c on c.id=wo.client_id and c.company_id=wo.company_id left join public.sites s on s.id=wo.site_id and s.company_id=wo.company_id left join public.equipment e on e.id=wo.main_equipment_id and e.company_id=wo.company_id left join mat on mat.company_id=wo.company_id and mat.work_order_id=wo.id left join tim on tim.company_id=wo.company_id and tim.work_order_id=wo.id left join aux on aux.company_id=wo.company_id and aux.work_order_id=wo.id left join quoted on quoted.company_id=wo.company_id and quoted.work_order_id=wo.id where wo.deleted_at is null),
calc as (select b.*,case when b.status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(b.real_cost_amount,0) else round(b.material_cost+b.time_cost+b.auxiliary_cost,2) end real_cost_calc,case when b.warranty or not b.billable or b.economic_status in ('garantia','no_facturable') then 0 else b.quoted_calc+b.additional_calc end sale_calc from base b)
select id,company_id,code,title,status,type,scheduled_date,client_id,client_name,site_id,site_name,main_equipment_id,equipment_code,economic_status,billable,warranty,material_cost,time_cost,auxiliary_cost,travel_cost,mobile_workshop_cost,platform_cost,external_cost,real_cost_calc real_cost_amount,sale_calc estimated_sale_amount,case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then margin_amount else round(sale_calc-real_cost_calc,2) end estimated_margin_amount,invoiced_amount,paid_amount,sale_calc sale_amount,case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then margin_amount else round(sale_calc-real_cost_calc,2) end margin_amount,case when sale_calc>0 then round((sale_calc-real_cost_calc)/sale_calc*100,2) else null end margin_percentage,real_cost_calc real_cost,quoted_calc quoted_sale_amount,additional_calc additional_sale_amount,quote_id from calc;

create or replace view public.v_client_economic_summary with (security_invoker=true) as
with w as (select company_id,client_id,round(sum(real_cost_amount),2) real_cost_amount,round(sum(quoted_sale_amount),2) quoted_sale_amount,round(sum(additional_sale_amount),2) additional_sale_amount,round(sum(sale_amount),2) sale_amount,count(*) filter(where warranty or economic_status='garantia') warranty_work_orders,count(*) filter(where billable and economic_status in ('facturable','pendiente_facturar')) billable_work_orders,count(*) filter(where economic_status='pendiente_facturar') pending_invoice_work_orders,round(sum(real_cost_amount) filter(where warranty or economic_status='garantia'),2) warranty_cost from public.v_work_order_economic_summary where client_id is not null group by company_id,client_id),
q as (select q.company_id,q.client_id,round(sum(case when wo.id is null then coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0) else 0 end),2) orphan_quote_sale_amount,round(sum(coalesce(q.total_amount,q.total,0)),2) quote_total_amount,round(sum(coalesce(q.tax_amount,0)),2) quote_tax_amount,count(*) filter(where q.status='Aceptado') accepted_quotes,count(*) filter(where q.status='Ejecutado en cliente') executed_quotes from public.quotes q left join public.work_orders wo on wo.company_id=q.company_id and (wo.quote_id=q.id or wo.id=q.work_order_id) and wo.deleted_at is null where q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') group by q.company_id,q.client_id)
select c.id,c.company_id,c.code,c.legal_name,coalesce(w.real_cost_amount,0) real_cost_amount,round(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0),2) estimated_sale_amount,round(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)-coalesce(w.real_cost_amount,0),2) estimated_margin_amount,coalesce(w.warranty_work_orders,0) warranty_work_orders,coalesce(w.billable_work_orders,0) billable_work_orders,coalesce(w.pending_invoice_work_orders,0) pending_invoice_work_orders,coalesce(w.quoted_sale_amount,0) quote_sale_amount,coalesce(q.quote_total_amount,0) quote_total_amount,coalesce(q.accepted_quotes,0) accepted_quotes,coalesce(q.executed_quotes,0) executed_quotes,round(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0),2) sale_amount,round(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)-coalesce(w.real_cost_amount,0),2) margin_amount,case when coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)>0 then round((coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)-coalesce(w.real_cost_amount,0))/(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0))*100,2) else null end margin_percentage,coalesce(w.warranty_cost,0) warranty_cost,coalesce(q.quote_tax_amount,0) quote_tax_amount,coalesce(w.real_cost_amount,0) real_cost,coalesce(w.quoted_sale_amount,0) quoted_sale_amount,coalesce(w.additional_sale_amount,0) additional_sale_amount from public.clients c left join w on w.company_id=c.company_id and w.client_id=c.id left join q on q.company_id=c.company_id and q.client_id=c.id where c.deleted_at is null;

create or replace view public.v_management_metrics with (security_invoker=true) as
with cc as (select company_id,count(*) clients from public.clients where deleted_at is null group by company_id), ec as (select company_id,count(*) equipment from public.equipment where deleted_at is null group by company_id), w as (select company_id,count(*) work_orders,count(*) filter(where scheduled_date>=date_trunc('month',current_date)::date) work_orders_this_month,count(*) filter(where status in ('Finalizado tecnicamente','Enviado','Cerrado')) finished_work_orders,count(*) filter(where economic_status='pendiente_facturar' or(status in ('Finalizado tecnicamente','Enviado','Cerrado') and coalesce(invoiced_amount,0)=0 and not warranty)) pending_invoice_work_orders,round(sum(real_cost_amount) filter(where warranty or economic_status='garantia'),2) warranty_cost,round(sum(real_cost_amount),2) real_cost,round(sum(sale_amount),2) sale_amount,round(sum(quoted_sale_amount),2) quoted_sale_amount,round(sum(additional_sale_amount),2) additional_sale_amount from public.v_work_order_economic_summary group by company_id),
q as (select q.company_id,count(*) filter(where q.status='Aceptado') accepted_quotes,count(*) filter(where q.status='Ejecutado en cliente') executed_quotes,round(sum(case when wo.id is null then coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0) else 0 end),2) orphan_quote_sale_amount,round(sum(coalesce(q.tax_amount,0)),2) tax_amount,round(sum(coalesce(q.total_amount,q.total,0)),2) total_amount from public.quotes q left join public.work_orders wo on wo.company_id=q.company_id and(wo.quote_id=q.id or wo.id=q.work_order_id) and wo.deleted_at is null where q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') group by q.company_id)
select c.id company_id,coalesce(cc.clients,0) clients,coalesce(ec.equipment,0) equipment,coalesce(w.work_orders_this_month,0) work_orders_this_month,coalesce(q.accepted_quotes,0) accepted_quotes,round(coalesce(w.quoted_sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0),2) accepted_quote_amount,coalesce(w.work_orders,0) work_orders,coalesce(w.finished_work_orders,0) finished_work_orders,coalesce(w.warranty_cost,0) warranty_cost,coalesce(w.pending_invoice_work_orders,0) pending_invoice_work_orders,coalesce(q.executed_quotes,0) executed_quotes,round(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0),2) sale_amount,coalesce(q.tax_amount,0) tax_amount,coalesce(q.total_amount,0) total_amount,coalesce(w.real_cost,0) real_cost,round(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)-coalesce(w.real_cost,0),2) margin_amount,case when coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)>0 then round((coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0)-coalesce(w.real_cost,0))/(coalesce(w.sale_amount,0)+coalesce(q.orphan_quote_sale_amount,0))*100,2) else null end margin_percentage,coalesce(w.quoted_sale_amount,0) quoted_sale_amount,coalesce(w.additional_sale_amount,0) additional_sale_amount from public.companies c left join cc on cc.company_id=c.id left join ec on ec.company_id=c.id left join w on w.company_id=c.id left join q on q.company_id=c.id;

revoke all on function public.dmp_resolve_rate(uuid,uuid,date) from public,anon;
revoke all on function public.dmp_resolve_rate(uuid,uuid,date) from authenticated;
revoke all on function public.dmp_rate_catalog_for_selection(text) from public,anon;
grant execute on function public.dmp_rate_catalog_for_selection(text) to authenticated;
revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from public,anon;
grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated;
revoke all on function public.dmp_upsert_work_order_cost_entry(jsonb) from public,anon;
grant execute on function public.dmp_upsert_work_order_cost_entry(jsonb) to authenticated;
revoke all on table public.rate_catalog from public,anon;
revoke all on table public.rate_versions from public,anon;
grant select on public.rate_catalog, public.rate_versions to authenticated;

commit;
