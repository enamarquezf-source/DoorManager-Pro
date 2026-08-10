-- DoorManager Pro - horas opcionales, jornada por fecha asignada y edicion real de intervencion.
-- No desactiva RLS: mantiene RPC con perfil activo, company_id y permisos existentes.

begin;

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
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
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
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
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
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
  v_description text := trim(coalesce(p_payload->>'description', ''));
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp025_assert_time_target((p_payload->>'work_order_id')::uuid, v_profile_id);
  v_duration := public.dmp024_work_minutes(nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), nullif(p_payload->>'duration_minutes', '')::integer);

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
           description = v_description,
           updated_by = v_actor.id,
           updated_at = now()
     where id = v_id;
    return v_id;
  end if;

  insert into public.work_order_time_entries(company_id, work_order_id, profile_id, work_date, started_at, ended_at, break_minutes, duration_minutes, manual_duration, hour_type, description, created_by, updated_by)
  values (v_work.company_id, v_work.id, v_profile_id, coalesce(nullif(p_payload->>'work_date', '')::date, current_date), nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), v_duration, nullif(p_payload->>'started_at', '') is null, coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), v_description, v_actor.id, v_actor.id)
  returning id into v_id;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.assign_technician(
  p_work_order_id uuid,
  p_technician_id uuid,
  p_assignment_date date,
  p_start time,
  p_end time,
  p_role text,
  p_assigned_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_assignment_id uuid;
begin
  select company_id, status into v_company_id, v_status from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_assigned_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para asignar tecnicos'; end if;
  if p_assignment_date is null then raise exception 'La fecha de asignacion es obligatoria'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_technician_id and p.company_id = v_company_id and p.active = true and p.deleted_at is null and (p.primary_area = 'Tecnico' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Tecnico'))) then
    raise exception 'El perfil no es tecnico activo de la empresa';
  end if;

  insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, assigned_by)
  values (v_company_id, p_work_order_id, p_technician_id, p_assignment_date, p_start, p_end, coalesce(nullif(p_role, ''), 'Principal'), p_assigned_by)
  on conflict (work_order_id, technician_id, assignment_date) do update
    set deleted_at = null, role = excluded.role, status = 'Asignado', planned_start_time = excluded.planned_start_time, planned_end_time = excluded.planned_end_time, assigned_by = p_assigned_by, updated_at = now()
  returning id into v_assignment_id;

  update public.work_orders
  set main_technician_id = case when coalesce(nullif(p_role, ''), 'Principal') = 'Principal' then p_technician_id else main_technician_id end,
      scheduled_date = p_assignment_date,
      scheduled_time = p_start,
      status = case when v_status in ('Pendiente','Devuelto por SAT') then 'Pendiente' else status end,
      updated_by = p_assigned_by,
      updated_at = now()
  where id = p_work_order_id;

  return v_assignment_id;
end;
$$;

create or replace function public.manage_work_order_assignments(
  p_work_order_id uuid,
  p_main_technician_id uuid,
  p_support_technician_ids uuid[],
  p_commercial_id uuid,
  p_assignment_date date,
  p_start time,
  p_end time,
  p_changed_by uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_code text;
  v_status text;
  v_existing_responsible_id uuid;
  v_existing_responsible_is_commercial boolean := false;
  v_support_id uuid;
  v_support_ids uuid[] := coalesce(p_support_technician_ids, array[]::uuid[]);
begin
  select company_id, code, status, current_responsible_id into v_company_id, v_code, v_status, v_existing_responsible_id
  from public.work_orders
  where id = p_work_order_id and deleted_at is null
  for update;

  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para gestionar asignaciones'; end if;
  if p_assignment_date is null then raise exception 'La fecha de asignacion es obligatoria'; end if;

  if p_main_technician_id is not null and not exists (select 1 from public.profiles p where p.id = p_main_technician_id and p.company_id = v_company_id and p.active = true and p.deleted_at is null and (p.primary_area = 'Tecnico' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Tecnico'))) then
    raise exception 'El tecnico principal no pertenece a la empresa o no esta activo';
  end if;
  if p_commercial_id is not null and not exists (select 1 from public.profiles p where p.id = p_commercial_id and p.company_id = v_company_id and p.active = true and p.deleted_at is null and (p.primary_area = 'Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Comercial'))) then
    raise exception 'El comercial no pertenece a la empresa o no esta activo';
  end if;
  if v_existing_responsible_id is not null and exists (select 1 from public.profiles p where p.id = v_existing_responsible_id and p.company_id = v_company_id and (p.primary_area = 'Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Comercial'))) then
    v_existing_responsible_is_commercial := true;
  end if;

  update public.work_order_assignments
  set deleted_at = now(), status = 'Cancelado', updated_at = now()
  where work_order_id = p_work_order_id
    and deleted_at is null
    and technician_id <> coalesce(p_main_technician_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and not (technician_id = any(v_support_ids));

  update public.work_order_assignments
  set deleted_at = now(), status = 'Cancelado', updated_at = now()
  where work_order_id = p_work_order_id
    and deleted_at is null
    and role = 'Principal'
    and technician_id <> coalesce(p_main_technician_id, '00000000-0000-0000-0000-000000000000'::uuid);

  if p_main_technician_id is not null then
    insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, status, assigned_by)
    values (v_company_id, p_work_order_id, p_main_technician_id, p_assignment_date, p_start, p_end, 'Principal', 'Asignado', p_changed_by)
    on conflict (work_order_id, technician_id, assignment_date) do update
      set deleted_at = null, role = 'Principal', status = 'Asignado', planned_start_time = excluded.planned_start_time, planned_end_time = excluded.planned_end_time, assigned_by = p_changed_by, updated_at = now();
  end if;

  foreach v_support_id in array v_support_ids loop
    if v_support_id is not null and v_support_id is distinct from p_main_technician_id then
      if not exists (select 1 from public.profiles p where p.id = v_support_id and p.company_id = v_company_id and p.active = true and p.deleted_at is null and (p.primary_area = 'Tecnico' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Tecnico'))) then
        raise exception 'Un tecnico de apoyo no pertenece a la empresa o no esta activo';
      end if;
      insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, status, assigned_by)
      values (v_company_id, p_work_order_id, v_support_id, p_assignment_date, p_start, p_end, 'Apoyo', 'Asignado', p_changed_by)
      on conflict (work_order_id, technician_id, assignment_date) do update
        set deleted_at = null, role = 'Apoyo', status = 'Asignado', planned_start_time = excluded.planned_start_time, planned_end_time = excluded.planned_end_time, assigned_by = p_changed_by, updated_at = now();
    end if;
  end loop;

  update public.work_orders
  set main_technician_id = p_main_technician_id,
      current_responsible_id = case when p_commercial_id is not null then p_commercial_id when v_existing_responsible_id is not null and not v_existing_responsible_is_commercial then v_existing_responsible_id else null end,
      scheduled_date = p_assignment_date,
      scheduled_time = p_start,
      status = case when v_status in ('Pendiente','Devuelto por SAT') then 'Pendiente' else status end,
      updated_by = p_changed_by,
      updated_at = now()
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  values (v_company_id, p_work_order_id, v_status, case when v_status in ('Pendiente','Devuelto por SAT') then 'Pendiente' else v_status end, p_changed_by, coalesce(nullif(p_reason, ''), 'Gestion de asignaciones del parte ' || v_code), true);
end;
$$;

create or replace function public.dmp_update_work_order_operational_fields(p_work_order_id uuid, p_payload jsonb)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_observations text := nullif(trim(coalesce(p_payload->>'observations', '')), '');
begin
  v_work := public.dmp_assert_work_order_operator(p_work_order_id, false);
  v_old := to_jsonb(v_work);

  update public.work_orders
  set
    description = case when p_payload ? 'description' then nullif(p_payload->>'description', '') else description end,
    diagnosis = case when p_payload ? 'diagnosis' then nullif(p_payload->>'diagnosis', '') else diagnosis end,
    work_performed = case when p_payload ? 'work_performed' then nullif(p_payload->>'work_performed', '') else work_performed end,
    result = case when p_payload ? 'result' then nullif(p_payload->>'result', '') else result end,
    planned_material = case when p_payload ? 'planned_material' then nullif(p_payload->>'planned_material', '') else planned_material end,
    updated_by = v_profile.id,
    updated_at = now()
  where id = v_work.id and company_id = v_work.company_id and deleted_at is null
  returning * into v_work;

  if p_payload ? 'observations' and v_observations is not null then
    insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by)
    values (v_work.company_id, v_work.id, 'Observaciones: ' || v_observations, 'Tecnica', v_profile.id);
  end if;

  if p_payload ? 'description' then v_changed := v_changed || jsonb_build_object('description', jsonb_build_object('old', v_old->>'description', 'new', v_work.description)); end if;
  if p_payload ? 'diagnosis' then v_changed := v_changed || jsonb_build_object('diagnosis', jsonb_build_object('old', v_old->>'diagnosis', 'new', v_work.diagnosis)); end if;
  if p_payload ? 'work_performed' then v_changed := v_changed || jsonb_build_object('work_performed', jsonb_build_object('old', v_old->>'work_performed', 'new', v_work.work_performed)); end if;
  if p_payload ? 'result' then v_changed := v_changed || jsonb_build_object('result', jsonb_build_object('old', v_old->>'result', 'new', v_work.result)); end if;
  if p_payload ? 'planned_material' then v_changed := v_changed || jsonb_build_object('planned_material', jsonb_build_object('old', v_old->>'planned_material', 'new', v_work.planned_material)); end if;
  if p_payload ? 'observations' then v_changed := v_changed || jsonb_build_object('observations', jsonb_build_object('old', null, 'new', v_observations)); end if;

  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_work.company_id, 'work_orders', v_work.id, 'OPERATIONAL_UPDATE', v_profile.id, v_old, jsonb_build_object('changed_fields', v_changed, 'updated_at', v_work.updated_at, 'updated_by', v_profile.id));

  return v_work;
end;
$$;

revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from anon;
grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated;
revoke all on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) from public;
revoke all on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) from anon;
grant execute on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) to authenticated;
revoke all on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) from public;
revoke all on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) from anon;
grant execute on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) to authenticated;
revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from public;
revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from anon;
grant execute on function public.dmp_update_work_order_operational_fields(uuid, jsonb) to authenticated;

commit;
