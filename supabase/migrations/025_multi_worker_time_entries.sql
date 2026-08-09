-- DoorManager Pro - registro de horas para trabajadores asignados
-- Incremental post 024. Reejecutable, transaccional, sin DROP CASCADE.

begin;

alter table public.work_order_time_entries add column if not exists updated_by uuid references public.profiles(id);
update public.work_order_time_entries set updated_by = coalesce(updated_by, created_by) where updated_by is null;

create or replace function public.dmp025_actor_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'perfil activo: sesion anonima no permitida'; end if;
  select * into v_profile from public.profiles where auth_user_id = auth.uid() and active = true and deleted_at is null;
  if v_profile.id is null then raise exception 'perfil activo: perfil no encontrado o inactivo'; end if;
  return v_profile;
end;
$$;

create or replace function public.dmp025_has_active_assignment(p_work_order_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_order_assignments a
    join public.profiles p on p.id = a.technician_id and p.active = true and p.deleted_at is null
    where a.work_order_id = p_work_order_id
      and a.technician_id = p_profile_id
      and a.deleted_at is null
      and a.status not in ('Finalizado','Cancelado')
  );
$$;

create or replace function public.dmp025_can_commercial_operate(p_work public.work_orders, p_profile public.profiles)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_work.origin = 'Comercial'
     and p_work.company_id = p_profile.company_id
     and (p_work.created_by = p_profile.id or p_work.current_responsible_id = p_profile.id);
$$;

create or replace function public.dmp025_assert_time_target(p_work_order_id uuid, p_target_profile_id uuid)
returns public.work_orders
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp025_actor_profile();
  v_target public.profiles;
  v_work public.work_orders;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
  v_commercial boolean := public.has_any_role(array['Comercial']);
  v_technician boolean := public.has_any_role(array['Tecnico']);
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no admite horas', v_work.status; end if;

  select * into v_target from public.profiles where id = p_target_profile_id and active = true and deleted_at is null;
  if v_target.id is null then raise exception 'perfil activo: trabajador no encontrado, inactivo o eliminado'; end if;
  if v_target.company_id is distinct from v_work.company_id then raise exception 'empresa: el trabajador no pertenece a la empresa del parte'; end if;

  if v_admin then return v_work; end if;

  if v_technician then
    if not public.dmp025_has_active_assignment(v_work.id, v_actor.id) then raise exception 'asignacion: tecnico actor sin asignacion activa para este parte'; end if;
    if not public.dmp025_has_active_assignment(v_work.id, v_target.id) then raise exception 'asignacion: trabajador sin asignacion activa para este parte'; end if;
    return v_work;
  end if;

  if v_commercial and public.dmp025_can_commercial_operate(v_work, v_actor) then
    if not public.dmp025_has_active_assignment(v_work.id, v_target.id) then raise exception 'asignacion: Comercial solo puede registrar horas de personas asignadas activamente al parte'; end if;
    return v_work;
  end if;

  raise exception 'permiso: rol sin permiso para registrar horas de este parte';
end;
$$;

create or replace function public.dmp_work_order_time_worker_options(p_work_order_id uuid)
returns table(profile_id uuid, full_name text, primary_area text, assignment_role text, is_current_user boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp025_actor_profile();
  v_work public.work_orders;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
  v_commercial boolean := public.has_any_role(array['Comercial']);
  v_technician boolean := public.has_any_role(array['Tecnico']);
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);

  if v_admin then
    return query
    select p.id, trim(p.first_name || ' ' || p.last_name)::text, p.primary_area::text, null::text, p.id = v_actor.id
    from public.profiles p
    where p.company_id = v_work.company_id and p.active = true and p.deleted_at is null
    order by p.first_name, p.last_name;
    return;
  end if;

  if v_technician then
    if not public.dmp025_has_active_assignment(v_work.id, v_actor.id) then raise exception 'asignacion: tecnico actor sin asignacion activa para este parte'; end if;
  elsif not (v_commercial and public.dmp025_can_commercial_operate(v_work, v_actor)) then
    raise exception 'permiso: rol sin permiso para consultar trabajadores de horas';
  end if;

  return query
  select p.id, trim(p.first_name || ' ' || p.last_name)::text, p.primary_area::text, a.role::text, p.id = v_actor.id
  from public.work_order_assignments a
  join public.profiles p on p.id = a.technician_id and p.active = true and p.deleted_at is null and p.company_id = v_work.company_id
  where a.work_order_id = v_work.id and a.company_id = v_work.company_id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')
  order by case when a.role = 'Principal' then 0 else 1 end, p.first_name, p.last_name;
end;
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
  v_duration integer;
  v_existing public.work_order_time_entries;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp025_assert_time_target((p_payload->>'work_order_id')::uuid, v_profile_id);
  v_duration := public.dmp024_work_minutes(nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), nullif(p_payload->>'duration_minutes', '')::integer);
  if trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'validacion del formulario: describe el trabajo realizado'; end if;

  if v_id is not null then
    select * into v_existing from public.work_order_time_entries where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id for update;
    if v_existing.id is null then raise exception 'parte: registro de horas no existe para este parte'; end if;
    if not (v_admin or v_existing.created_by = v_actor.id) then raise exception 'permiso: registro de horas no editable para este usuario'; end if;
    update public.work_order_time_entries
       set profile_id = v_profile_id,
           work_date = coalesce(nullif(p_payload->>'work_date', '')::date, work_date),
           started_at = nullif(p_payload->>'started_at', '')::time,
           ended_at = nullif(p_payload->>'ended_at', '')::time,
           break_minutes = coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0),
           duration_minutes = v_duration,
           manual_duration = nullif(p_payload->>'started_at', '') is null,
           hour_type = coalesce(nullif(p_payload->>'hour_type', ''), 'normal'),
           description = trim(p_payload->>'description'),
           updated_by = v_actor.id,
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.work_order_time_entries(company_id, work_order_id, profile_id, work_date, started_at, ended_at, break_minutes, duration_minutes, manual_duration, hour_type, description, created_by, updated_by)
  values (v_work.company_id, v_work.id, v_profile_id, coalesce(nullif(p_payload->>'work_date', '')::date, current_date), nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), v_duration, nullif(p_payload->>'started_at', '') is null, coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), trim(p_payload->>'description'), v_actor.id, v_actor.id)
  returning id into v_id;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.dmp_delete_work_order_time_entry(p_time_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp025_actor_profile();
  v_entry public.work_order_time_entries;
  v_work public.work_orders;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into v_entry from public.work_order_time_entries where id = p_time_entry_id for update;
  if v_entry.id is null then raise exception 'parte: registro de horas no encontrado'; end if;
  v_work := public.dmp025_assert_time_target(v_entry.work_order_id, v_entry.profile_id);
  if not (v_admin or v_entry.created_by = v_actor.id) then raise exception 'permiso: registro de horas no eliminable para este usuario'; end if;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_entry.company_id, 'work_order_time_entries', v_entry.id, 'DELETE', v_actor.id, to_jsonb(v_entry), jsonb_build_object('reason', p_reason, 'work_order_id', v_work.id));
  delete from public.work_order_time_entries where id = p_time_entry_id;
end;
$$;

revoke all on function public.dmp025_actor_profile() from public;
revoke all on function public.dmp025_has_active_assignment(uuid, uuid) from public;
revoke all on function public.dmp025_can_commercial_operate(public.work_orders, public.profiles) from public;
revoke all on function public.dmp025_assert_time_target(uuid, uuid) from public;
revoke all on function public.dmp_work_order_time_worker_options(uuid) from public;
revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from public;
revoke all on function public.dmp_delete_work_order_time_entry(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.dmp025_actor_profile() from anon;
    revoke all on function public.dmp025_has_active_assignment(uuid, uuid) from anon;
    revoke all on function public.dmp025_can_commercial_operate(public.work_orders, public.profiles) from anon;
    revoke all on function public.dmp025_assert_time_target(uuid, uuid) from anon;
    revoke all on function public.dmp_work_order_time_worker_options(uuid) from anon;
    revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from anon;
    revoke all on function public.dmp_delete_work_order_time_entry(uuid, text) from anon;
  end if;
end;
$$;

revoke all on function public.dmp025_actor_profile() from authenticated;
revoke all on function public.dmp025_has_active_assignment(uuid, uuid) from authenticated;
revoke all on function public.dmp025_can_commercial_operate(public.work_orders, public.profiles) from authenticated;
revoke all on function public.dmp025_assert_time_target(uuid, uuid) from authenticated;
grant execute on function public.dmp_work_order_time_worker_options(uuid) to authenticated;
grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated;
grant execute on function public.dmp_delete_work_order_time_entry(uuid, text) to authenticated;

commit;
