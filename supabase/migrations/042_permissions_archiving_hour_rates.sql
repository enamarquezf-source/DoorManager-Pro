-- DoorManager Pro - tarifas de horas, economia por rol y archivado ampliado.
-- Idempotente. Mantiene RLS activo y permisos por rol.

begin;

create table if not exists public.technician_hour_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  technician_profile_id uuid references public.profiles(id),
  category text,
  hourly_cost numeric(12,2) not null default 0 check (hourly_cost >= 0),
  hourly_price numeric(12,2) not null default 0 check (hourly_price >= 0),
  valid_from date not null default current_date,
  valid_to date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint technician_hour_rates_target_check check (technician_profile_id is not null or nullif(category, '') is not null),
  constraint technician_hour_rates_valid_range check (valid_to is null or valid_to >= valid_from)
);

create index if not exists technician_hour_rates_company_active_idx on public.technician_hour_rates(company_id, active, deleted_at);
create index if not exists technician_hour_rates_profile_valid_idx on public.technician_hour_rates(company_id, technician_profile_id, valid_from, valid_to) where deleted_at is null;

alter table public.technician_hour_rates enable row level security;

drop policy if exists technician_hour_rates_select_authorized on public.technician_hour_rates;
drop policy if exists technician_hour_rates_insert_management on public.technician_hour_rates;
drop policy if exists technician_hour_rates_update_management on public.technician_hour_rates;
drop policy if exists technician_hour_rates_no_delete on public.technician_hour_rates;

create policy technician_hour_rates_select_authorized on public.technician_hour_rates for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy technician_hour_rates_insert_management on public.technician_hour_rates for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy technician_hour_rates_update_management on public.technician_hour_rates for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy technician_hour_rates_no_delete on public.technician_hour_rates for delete to authenticated using (false);

alter table public.materials add column if not exists deleted_by uuid references public.profiles(id);
alter table public.materials add column if not exists delete_reason text;
alter table public.equipment_components add column if not exists deleted_by uuid references public.profiles(id);
alter table public.equipment_components add column if not exists delete_reason text;
alter table public.documents add column if not exists deleted_by uuid references public.profiles(id);
alter table public.documents add column if not exists delete_reason text;
alter table public.alerts add column if not exists deleted_by uuid references public.profiles(id);
alter table public.alerts add column if not exists delete_reason text;
alter table public.opportunities add column if not exists deleted_by uuid references public.profiles(id);
alter table public.opportunities add column if not exists delete_reason text;

create or replace function public.dmp_lifecycle_allowed_entities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['clients','sites','equipment','equipment_components','cases','work_orders','checks','check_templates','profiles','quotes','materials','documents','alerts','opportunities']::text[];
$$;

create or replace function public.dmp_lifecycle_target_company(p_entity text, p_entity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_entity <> all(public.dmp_lifecycle_allowed_entities()) then
    raise exception 'Entidad no permitida para gestion de ciclo de vida: %', p_entity;
  end if;

  if p_entity = 'clients' then select company_id into v_company_id from public.clients where id = p_entity_id;
  elsif p_entity = 'sites' then select company_id into v_company_id from public.sites where id = p_entity_id;
  elsif p_entity = 'equipment' then select company_id into v_company_id from public.equipment where id = p_entity_id;
  elsif p_entity = 'equipment_components' then select company_id into v_company_id from public.equipment_components where id = p_entity_id;
  elsif p_entity = 'cases' then select company_id into v_company_id from public.cases where id = p_entity_id;
  elsif p_entity = 'work_orders' then select company_id into v_company_id from public.work_orders where id = p_entity_id;
  elsif p_entity = 'checks' then select company_id into v_company_id from public.checks where id = p_entity_id;
  elsif p_entity = 'check_templates' then select company_id into v_company_id from public.check_templates where id = p_entity_id;
  elsif p_entity = 'profiles' then select company_id into v_company_id from public.profiles where id = p_entity_id;
  elsif p_entity = 'quotes' then select company_id into v_company_id from public.quotes where id = p_entity_id;
  elsif p_entity = 'materials' then select company_id into v_company_id from public.materials where id = p_entity_id;
  elsif p_entity = 'documents' then select company_id into v_company_id from public.documents where id = p_entity_id;
  elsif p_entity = 'alerts' then select company_id into v_company_id from public.alerts where id = p_entity_id;
  elsif p_entity = 'opportunities' then select company_id into v_company_id from public.opportunities where id = p_entity_id;
  end if;

  if v_company_id is null then raise exception 'Registro no encontrado o sin empresa asociada'; end if;
  return v_company_id;
end;
$$;

create or replace function public.dmp_current_hour_rate(p_company_id uuid, p_profile_id uuid, p_work_date date)
returns table(hourly_cost numeric, hourly_price numeric, rate_id uuid)
language sql
stable
set search_path = public
as $$
  select r.hourly_cost, r.hourly_price, r.id
  from public.technician_hour_rates r
  where r.company_id = p_company_id
    and r.deleted_at is null
    and r.active = true
    and r.valid_from <= coalesce(p_work_date, current_date)
    and (r.valid_to is null or r.valid_to >= coalesce(p_work_date, current_date))
    and (r.technician_profile_id = p_profile_id or r.technician_profile_id is null)
  order by case when r.technician_profile_id = p_profile_id then 0 else 1 end, r.valid_from desc, r.created_at desc
  limit 1;
$$;

create or replace function public.dmp_upsert_work_order_time_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp025_actor_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_profile_id uuid := coalesce(nullif(p_payload->>'profile_id', '')::uuid, v_actor.id);
  v_work_date date := coalesce(nullif(p_payload->>'work_date', '')::date, current_date);
  v_duration integer;
  v_existing public.work_order_time_entries;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
  v_description text := trim(coalesce(p_payload->>'description', ''));
  v_rate record;
  v_hourly_cost numeric := nullif(p_payload->>'hourly_cost', '')::numeric;
  v_hourly_price numeric := nullif(p_payload->>'hourly_price', '')::numeric;
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp025_assert_time_target((p_payload->>'work_order_id')::uuid, v_profile_id);
  v_duration := public.dmp024_work_minutes(nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), nullif(p_payload->>'duration_minutes', '')::integer);

  select * into v_rate from public.dmp_current_hour_rate(v_work.company_id, v_profile_id, v_work_date);
  v_hourly_cost := coalesce(v_hourly_cost, v_rate.hourly_cost, 0);
  v_hourly_price := coalesce(v_hourly_price, v_rate.hourly_price, 0);

  if v_id is not null then
    select * into v_existing from public.work_order_time_entries where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id for update;
    if v_existing.id is null then raise exception 'parte: registro de horas no existe para este parte'; end if;
    if not (v_admin or v_existing.created_by = v_actor.id) then raise exception 'permiso: registro de horas no editable para este usuario'; end if;
    update public.work_order_time_entries
       set profile_id = v_profile_id,
           work_date = v_work_date,
           started_at = nullif(p_payload->>'started_at', '')::time,
           ended_at = nullif(p_payload->>'ended_at', '')::time,
           break_minutes = coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0),
           duration_minutes = v_duration,
           manual_duration = nullif(p_payload->>'started_at', '') is null,
           hour_type = coalesce(nullif(p_payload->>'hour_type', ''), 'normal'),
           hourly_cost = v_hourly_cost,
           hourly_price = v_hourly_price,
           total_cost = round(v_duration::numeric / 60 * v_hourly_cost, 2),
           total_price = round(v_duration::numeric / 60 * v_hourly_price, 2),
           description = v_description,
           updated_by = v_actor.id,
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.work_order_time_entries(company_id, work_order_id, profile_id, work_date, started_at, ended_at, break_minutes, duration_minutes, manual_duration, hour_type, hourly_cost, hourly_price, total_cost, total_price, description, created_by, updated_by)
  values (v_work.company_id, v_work.id, v_profile_id, v_work_date, nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), v_duration, nullif(p_payload->>'started_at', '') is null, coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), v_hourly_cost, v_hourly_price, round(v_duration::numeric / 60 * v_hourly_cost, 2), round(v_duration::numeric / 60 * v_hourly_price, 2), v_description, v_actor.id, v_actor.id)
  returning id into v_id;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.dmp_archive_entity(p_entity text, p_entity_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_old jsonb;
  v_new jsonb;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  if p_entity = 'quotes' then return public.dmp_archive_quote(p_entity_id, p_reason); end if;

  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);

  if p_entity = 'clients' then
    select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.clients set deleted_at = coalesce(deleted_at, now()), status = case when status = 'Activo' then 'Inactivo' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(clients.*) into v_new;
  elsif p_entity = 'sites' then
    select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.sites set deleted_at = coalesce(deleted_at, now()), active = false, updated_at = now() where id = p_entity_id returning to_jsonb(sites.*) into v_new;
  elsif p_entity = 'equipment' then
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.equipment set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Operativo','Pendiente de revision') then 'Fuera de servicio' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(equipment.*) into v_new;
  elsif p_entity = 'equipment_components' then
    select to_jsonb(t) into v_old from public.equipment_components t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.equipment_components set deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), status = case when status = 'Operativo' then 'Archivado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(equipment_components.*) into v_new;
  elsif p_entity = 'cases' then
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.cases set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Abierto','En curso','Pendiente') then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(cases.*) into v_new;
  elsif p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.work_orders set deleted_at = coalesce(deleted_at, now()), status = case when status not in ('Cerrado','Cancelado') then 'Cancelado' else status end, updated_by = v_actor.id, updated_at = now() where id = p_entity_id returning to_jsonb(work_orders.*) into v_new;
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_company_id, p_entity_id, v_old->>'status', v_new->>'status', v_actor.id, p_reason, true);
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.checks set deleted_at = coalesce(deleted_at, now()), status = case when status <> 'Realizado' then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(checks.*) into v_new;
  elsif p_entity = 'check_templates' then
    select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update;
    if coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;
    update public.check_templates set active = false, updated_at = now() where id = p_entity_id returning to_jsonb(check_templates.*) into v_new;
  elsif p_entity = 'profiles' then
    select to_jsonb(t) into v_old from public.profiles t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null or coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;
    update public.profiles set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now() where id = p_entity_id returning to_jsonb(profiles.*) into v_new;
  elsif p_entity = 'materials' then
    select to_jsonb(t) into v_old from public.materials t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.materials set active = false, deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), updated_at = now() where id = p_entity_id returning to_jsonb(materials.*) into v_new;
  elsif p_entity = 'documents' then
    select to_jsonb(t) into v_old from public.documents t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.documents set valid = false, deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), updated_at = now() where id = p_entity_id returning to_jsonb(documents.*) into v_new;
  elsif p_entity = 'alerts' then
    select to_jsonb(t) into v_old from public.alerts t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.alerts set status = case when status <> 'Cerrado' then 'Cancelado' else status end, deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), updated_at = now() where id = p_entity_id returning to_jsonb(alerts.*) into v_new;
  elsif p_entity = 'opportunities' then
    select to_jsonb(t) into v_old from public.opportunities t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.opportunities set status = case when status in ('Nueva','En estudio','Pendiente de valoracion','Presupuestada') then 'Perdida' else status end, deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), updated_at = now() where id = p_entity_id returning to_jsonb(opportunities.*) into v_new;
  else
    raise exception 'Entidad no permitida para archivar: %', p_entity;
  end if;

  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, p_entity, p_entity_id, 'SOFT_DELETE', p_reason, v_old, v_new);
  return public.dmp_lifecycle_dependencies(p_entity, p_entity_id) || jsonb_build_object('operation', 'archived');
end;
$$;

commit;
