-- DoorManager Pro - horas, materiales, estado directo y borrado definitivo controlado
-- Idempotente. No usa DROP CASCADE, no desactiva RLS y no concede permisos a anon/public.

begin;

create table if not exists public.work_order_time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  profile_id uuid not null references public.profiles(id),
  work_date date not null default current_date,
  started_at time,
  ended_at time,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  manual_duration boolean not null default false,
  hour_type text not null default 'normal' check (hour_type in ('normal','nocturna','festiva','desplazamiento','otra')),
  description text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_time_range_valid check ((started_at is null and ended_at is null) or (started_at is not null and ended_at is not null and ended_at > started_at))
);

create index if not exists work_order_time_entries_work_order_idx on public.work_order_time_entries(work_order_id, work_date);
create index if not exists work_order_time_entries_profile_idx on public.work_order_time_entries(profile_id, work_date);

alter table public.work_order_time_entries enable row level security;

drop policy if exists work_order_time_entries_select_scoped on public.work_order_time_entries;
create policy work_order_time_entries_select_scoped on public.work_order_time_entries for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.has_any_role(array['superadmin','SAT','Gerencia','Comercial'])
      or profile_id = public.current_profile_id()
      or public.is_assigned_to_work_order(work_order_id, public.current_profile_id())
    )
  );

drop policy if exists work_order_time_entries_insert_block_direct on public.work_order_time_entries;
create policy work_order_time_entries_insert_block_direct on public.work_order_time_entries for insert to authenticated with check (false);
drop policy if exists work_order_time_entries_update_block_direct on public.work_order_time_entries;
create policy work_order_time_entries_update_block_direct on public.work_order_time_entries for update to authenticated using (false) with check (false);
drop policy if exists work_order_time_entries_delete_block_direct on public.work_order_time_entries;
create policy work_order_time_entries_delete_block_direct on public.work_order_time_entries for delete to authenticated using (false);

alter table public.work_order_materials alter column material_id drop not null;
alter table public.work_order_materials add column if not exists description text;
alter table public.work_order_materials add column if not exists unit text not null default 'ud';
alter table public.work_order_materials add column if not exists registered_by uuid references public.profiles(id);
alter table public.work_order_materials add column if not exists used_at date not null default current_date;
alter table public.work_order_materials add column if not exists local_change_id text;
create unique index if not exists work_order_materials_company_local_change_unique on public.work_order_materials(company_id, local_change_id) where local_change_id is not null;

create or replace function public.dmp_active_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Operacion no permitida para usuarios anonimos'; end if;
  select * into v_profile from public.profiles where auth_user_id = auth.uid() and active = true and deleted_at is null;
  if v_profile.id is null then raise exception 'Perfil no encontrado o inactivo'; end if;
  return v_profile;
end;
$$;

create or replace function public.dmp_assert_work_order_operator(p_work_order_id uuid, p_manage_all boolean default false)
returns public.work_orders
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_work.id is null then raise exception 'Parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') and not public.has_any_role(array['superadmin','SAT','Gerencia']) then
    raise exception 'El parte esta cerrado o cancelado y no permite modificaciones operativas';
  end if;
  if public.has_any_role(array['superadmin','SAT','Gerencia']) then return v_work; end if;
  if p_manage_all then raise exception 'No tienes permisos para gestionar registros de otros usuarios'; end if;
  if public.has_any_role(array['Comercial']) and v_work.company_id = v_profile.company_id then return v_work; end if;
  if public.has_any_role(array['Tecnico']) and public.is_assigned_to_work_order(v_work.id, v_profile.id) then return v_work; end if;
  raise exception 'No tienes permisos para modificar este parte';
end;
$$;

create or replace function public.dmp_work_minutes(p_start time, p_end time, p_break integer, p_manual integer)
returns integer
language plpgsql
immutable
as $$
declare
  v_minutes integer;
begin
  if p_start is not null or p_end is not null then
    if p_start is null or p_end is null or p_end <= p_start then raise exception 'La hora de fin debe ser posterior a la hora de inicio'; end if;
    v_minutes := floor(extract(epoch from (p_end - p_start)) / 60)::integer - greatest(coalesce(p_break, 0), 0);
  else
    v_minutes := coalesce(p_manual, 0);
  end if;
  if v_minutes <= 0 then raise exception 'La duracion neta debe ser mayor que cero'; end if;
  return v_minutes;
end;
$$;

create or replace function public.dmp_upsert_work_order_time_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_profile_id uuid := coalesce(nullif(p_payload->>'profile_id', '')::uuid, v_profile.id);
  v_duration integer;
begin
  v_work := public.dmp_assert_work_order_operator((p_payload->>'work_order_id')::uuid, v_profile_id <> v_profile.id);
  if v_profile_id <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'Solo SAT, Gerencia o superadmin pueden registrar horas de otros trabajadores'; end if;
  v_duration := public.dmp_work_minutes(nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce((p_payload->>'break_minutes')::integer, 0), nullif(p_payload->>'duration_minutes', '')::integer);
  if trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'La descripcion del trabajo es obligatoria'; end if;
  if v_id is not null then
    if not exists (select 1 from public.work_order_time_entries where id = v_id and company_id = v_work.company_id and (profile_id = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia']))) then raise exception 'Registro de horas no editable'; end if;
    update public.work_order_time_entries set profile_id = v_profile_id, work_date = coalesce(nullif(p_payload->>'work_date', '')::date, work_date), started_at = nullif(p_payload->>'started_at', '')::time, ended_at = nullif(p_payload->>'ended_at', '')::time, break_minutes = coalesce((p_payload->>'break_minutes')::integer, 0), duration_minutes = v_duration, manual_duration = nullif(p_payload->>'started_at', '') is null, hour_type = coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), description = trim(p_payload->>'description'), updated_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.work_order_time_entries(company_id, work_order_id, profile_id, work_date, started_at, ended_at, break_minutes, duration_minutes, manual_duration, hour_type, description, created_by)
  values (v_work.company_id, v_work.id, v_profile_id, coalesce(nullif(p_payload->>'work_date', '')::date, current_date), nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce((p_payload->>'break_minutes')::integer, 0), v_duration, nullif(p_payload->>'started_at', '') is null, coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), trim(p_payload->>'description'), v_profile.id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_delete_work_order_time_entry(p_time_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_entry public.work_order_time_entries;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into v_entry from public.work_order_time_entries where id = p_time_entry_id for update;
  if v_entry.id is null then raise exception 'Registro de horas no encontrado'; end if;
  perform public.dmp_assert_work_order_operator(v_entry.work_order_id, v_entry.profile_id <> v_profile.id);
  if v_entry.profile_id <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para eliminar horas de otros trabajadores'; end if;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_entry.company_id, 'work_order_time_entries', v_entry.id, 'DELETE', v_profile.id, to_jsonb(v_entry), jsonb_build_object('reason', p_reason));
  delete from public.work_order_time_entries where id = p_time_entry_id;
end;
$$;

create or replace function public.dmp_upsert_work_order_material(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_material uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'used_quantity', '')::numeric, 1);
begin
  v_work := public.dmp_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if v_material is null and trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'Indica material de catalogo o descripcion no catalogada'; end if;
  if v_local is not null then select id into v_id from public.work_order_materials where company_id = v_work.company_id and local_change_id = v_local; end if;
  if v_id is not null then
    if not exists (select 1 from public.work_order_materials where id = v_id and company_id = v_work.company_id and (registered_by = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia']))) then raise exception 'Material no editable'; end if;
    update public.work_order_materials set material_id = v_material, description = nullif(p_payload->>'description', ''), used_quantity = v_quantity, unit = coalesce(nullif(p_payload->>'unit', ''), unit, 'ud'), unit_price = case when public.has_any_role(array['superadmin','SAT','Gerencia']) then coalesce(nullif(p_payload->>'unit_price', '')::numeric, unit_price, 0) else unit_price end, notes = nullif(p_payload->>'notes', ''), registered_by = coalesce(registered_by, v_profile.id), used_at = coalesce(nullif(p_payload->>'used_at', '')::date, used_at, current_date), updated_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.work_order_materials(company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit, unit_price, notes, registered_by, used_at, local_change_id)
  values (v_work.company_id, v_work.id, v_material, nullif(p_payload->>'description', ''), 0, v_quantity, coalesce(nullif(p_payload->>'unit', ''), 'ud'), case when public.has_any_role(array['superadmin','SAT','Gerencia']) then coalesce(nullif(p_payload->>'unit_price', '')::numeric, 0) else 0 end, nullif(p_payload->>'notes', ''), v_profile.id, coalesce(nullif(p_payload->>'used_at', '')::date, current_date), v_local)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_delete_work_order_material(p_material_usage_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_usage public.work_order_materials;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into v_usage from public.work_order_materials where id = p_material_usage_id for update;
  if v_usage.id is null then raise exception 'Material no encontrado'; end if;
  perform public.dmp_assert_work_order_operator(v_usage.work_order_id, coalesce(v_usage.registered_by, v_profile.id) <> v_profile.id);
  if coalesce(v_usage.registered_by, v_profile.id) <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para eliminar materiales de otros trabajadores'; end if;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_usage.company_id, 'work_order_materials', v_usage.id, 'DELETE', v_profile.id, to_jsonb(v_usage), jsonb_build_object('reason', p_reason));
  delete from public.work_order_materials where id = p_material_usage_id;
end;
$$;

create or replace function public.dmp_change_work_order_status(p_work_order_id uuid, p_new_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
  v_commercial boolean := public.has_any_role(array['Comercial']);
  v_manual boolean := false;
begin
  if p_new_status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado') then raise exception 'Estado de parte no valido'; end if;
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not v_admin and not (v_commercial and v_work.origin = 'Comercial' and v_work.company_id = v_profile.company_id) and not (public.has_any_role(array['Tecnico']) and public.is_assigned_to_work_order(v_work.id, v_profile.id) and p_new_status in ('Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente')) then
    raise exception 'No tienes permisos para seleccionar ese estado';
  end if;
  if v_work.status = p_new_status then return; end if;
  v_manual := p_new_status in ('Pendiente','Cancelado','Devuelto por SAT','Cerrado') or array_position(array['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado'], p_new_status) < array_position(array['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado'], v_work.status);
  if v_manual and trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio para retrocesos, cancelaciones, cierres o correcciones'; end if;
  update public.work_orders set status = p_new_status, updated_by = v_profile.id, updated_at = now(), finished_at = case when p_new_status = 'Finalizado tecnicamente' then coalesce(finished_at, now()) else finished_at end, sent_at = case when p_new_status = 'Enviado' then coalesce(sent_at, now()) else sent_at end where id = p_work_order_id;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_work.company_id, v_work.id, v_work.status, p_new_status, v_profile.id, nullif(p_reason, ''), v_manual);
end;
$$;

create or replace function public.dmp_permanently_delete_entity(p_entity text, p_entity_id uuid, p_reason text, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_deps jsonb;
  v_old jsonb;
  v_code text;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para eliminar definitivamente'; end if;
  v_deps := public.dmp_lifecycle_dependencies(p_entity, p_entity_id);
  v_code := coalesce(v_deps->>'code', p_entity_id::text);
  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then raise exception 'Confirmacion incorrecta. Escribe ELIMINAR %', v_code; end if;
  if p_entity = 'profiles' then raise exception 'Las cuentas Auth no se borran desde la aplicacion. Desactiva el perfil DMP.'; end if;
  if p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    if exists (select 1 from public.deficiencies where origin_work_order_id = p_entity_id and work_order_id is distinct from p_entity_id) then raise exception 'Hay deficiencias externas vinculadas a este parte. Resuelve esos vinculos antes de eliminar.'; end if;
    insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now()));
    delete from public.document_links where related_type = 'Parte' and related_id = p_entity_id;
    delete from public.alerts where related_entity = 'work_orders' and related_id = p_entity_id;
    delete from public.deficiencies where work_order_id = p_entity_id;
    delete from public.check_item_results where check_id in (select id from public.checks where work_order_id = p_entity_id);
    delete from public.check_section_results where check_id in (select id from public.checks where work_order_id = p_entity_id);
    delete from public.check_photos where check_id in (select id from public.checks where work_order_id = p_entity_id);
    delete from public.checks where work_order_id = p_entity_id;
    delete from public.work_order_time_entries where work_order_id = p_entity_id;
    delete from public.work_order_materials where work_order_id = p_entity_id;
    delete from public.work_order_notes where work_order_id = p_entity_id;
    delete from public.work_order_photos where work_order_id = p_entity_id;
    delete from public.work_order_signatures where work_order_id = p_entity_id;
    delete from public.work_order_assignments where work_order_id = p_entity_id;
    delete from public.work_order_equipment where work_order_id = p_entity_id;
    delete from public.work_order_status_history where work_order_id = p_entity_id;
    delete from public.work_orders where id = p_entity_id;
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    if exists (select 1 from public.deficiencies where check_id = p_entity_id) then raise exception 'El check tiene deficiencias vinculadas. Resuelve esas deficiencias antes de eliminar.'; end if;
    insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now()));
    delete from public.check_item_results where check_id = p_entity_id;
    delete from public.check_section_results where check_id = p_entity_id;
    delete from public.check_photos where check_id = p_entity_id;
    delete from public.checks where id = p_entity_id;
  else
    if coalesce((v_deps->>'can_permanently_delete')::boolean, false) is not true then raise exception '%', coalesce(v_deps->>'physical_delete_blocker', 'El registro tiene dependencias y no puede borrarse definitivamente'); end if;
    if p_entity = 'clients' then select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update; insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now())); delete from public.clients where id = p_entity_id;
    elsif p_entity = 'sites' then select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update; insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now())); delete from public.sites where id = p_entity_id;
    elsif p_entity = 'equipment' then select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update; insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now())); delete from public.equipment where id = p_entity_id;
    elsif p_entity = 'cases' then select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update; insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now())); delete from public.cases where id = p_entity_id;
    elsif p_entity = 'check_templates' then select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update; insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'dependency_summary', v_deps, 'deleted_at', now())); delete from public.check_templates where id = p_entity_id;
    else raise exception 'Entidad no soportada para borrado definitivo'; end if;
  end if;
  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description, metadata) values (v_company_id, v_actor.id, 'eliminacion definitiva', p_entity, p_entity_id, 'Registro eliminado definitivamente', jsonb_build_object('reason', p_reason, 'code', v_code, 'dependencies', v_deps));
  return jsonb_build_object('operation', 'permanently_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code);
end;
$$;

revoke all on function public.dmp_active_profile() from public;
revoke all on function public.dmp_assert_work_order_operator(uuid, boolean) from public;
revoke all on function public.dmp_work_minutes(time, time, integer, integer) from public;
revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from public;
revoke all on function public.dmp_delete_work_order_time_entry(uuid, text) from public;
revoke all on function public.dmp_upsert_work_order_material(jsonb) from public;
revoke all on function public.dmp_delete_work_order_material(uuid, text) from public;
revoke all on function public.dmp_change_work_order_status(uuid, text, text) from public;
revoke all on function public.dmp_permanently_delete_entity(text, uuid, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.dmp_active_profile() from anon;
    revoke all on function public.dmp_assert_work_order_operator(uuid, boolean) from anon;
    revoke all on function public.dmp_work_minutes(time, time, integer, integer) from anon;
    revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from anon;
    revoke all on function public.dmp_delete_work_order_time_entry(uuid, text) from anon;
    revoke all on function public.dmp_upsert_work_order_material(jsonb) from anon;
    revoke all on function public.dmp_delete_work_order_material(uuid, text) from anon;
    revoke all on function public.dmp_change_work_order_status(uuid, text, text) from anon;
    revoke all on function public.dmp_permanently_delete_entity(text, uuid, text, text) from anon;
  end if;
end;
$$;

grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated;
grant execute on function public.dmp_delete_work_order_time_entry(uuid, text) to authenticated;
grant execute on function public.dmp_upsert_work_order_material(jsonb) to authenticated;
grant execute on function public.dmp_delete_work_order_material(uuid, text) to authenticated;
grant execute on function public.dmp_change_work_order_status(uuid, text, text) to authenticated;
grant execute on function public.dmp_permanently_delete_entity(text, uuid, text, text) to authenticated;

commit;
