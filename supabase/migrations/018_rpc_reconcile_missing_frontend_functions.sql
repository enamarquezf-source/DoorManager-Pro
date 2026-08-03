-- DoorManager Pro - reconciliacion de RPC usadas por el frontend publicado
-- Idempotente. No reejecuta migraciones historicas completas ni modifica tablas/policies.

begin;

create or replace function public.create_case(
  p_company_id uuid,
  p_client_id uuid,
  p_site_id uuid,
  p_title text,
  p_description text default null,
  p_type text default 'Averia',
  p_priority text default 'Normal',
  p_status text default 'Abierto',
  p_origin text default 'SAT',
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_sequence integer;
begin
  perform public.assert_member_of_current_company(p_company_id);

  if not public.has_any_role(array['SAT','Comercial','Gerencia']) then
    raise exception 'No tienes permisos para crear expedientes';
  end if;

  if p_created_by is distinct from public.current_profile_id() then
    raise exception 'El creador no coincide con el usuario autenticado';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and company_id = p_company_id and deleted_at is null) then
    raise exception 'Cliente no valido';
  end if;

  if p_site_id is not null and not exists (select 1 from public.sites where id = p_site_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null) then
    raise exception 'Centro no valido';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':cases:' || to_char(now(), 'YYYY')));

  select coalesce(max(nullif(regexp_replace(code, '^EXP-' || to_char(now(), 'YYYY') || '-', ''), '')::integer), 0) + 1
  into v_sequence
  from public.cases
  where company_id = p_company_id
    and code ~ ('^EXP-' || to_char(now(), 'YYYY') || '-[0-9]+$');

  v_code := 'EXP-' || to_char(now(), 'YYYY') || '-' || lpad(v_sequence::text, 5, '0');

  insert into public.cases(company_id, code, title, description, type, priority, status, client_id, site_id, origin, created_by)
  values (p_company_id, v_code, p_title, p_description, p_type, p_priority, p_status, p_client_id, p_site_id, p_origin, p_created_by)
  returning id into v_id;

  insert into public.case_events(company_id, case_id, event_type, description, created_by)
  values (p_company_id, v_id, 'Creacion', 'Expediente creado con codigo automatico ' || v_code, p_created_by);

  return v_id;
end;
$$;

create or replace function public.unassign_work_order_profile(
  p_work_order_id uuid,
  p_profile_id uuid,
  p_changed_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para desasignar partes'; end if;

  update public.work_order_assignments
  set deleted_at = now(), status = 'Cancelado'
  where work_order_id = p_work_order_id
    and technician_id = p_profile_id
    and deleted_at is null;

  update public.work_orders
  set main_technician_id = case when main_technician_id = p_profile_id then null else main_technician_id end,
      current_responsible_id = case when current_responsible_id = p_profile_id then p_changed_by else current_responsible_id end,
      updated_by = p_changed_by
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  select v_company_id, id, status, status, p_changed_by, 'Desasignacion de perfil', true
  from public.work_orders where id = p_work_order_id;
end;
$$;

create or replace function public.assign_commercial_work_order(
  p_work_order_id uuid,
  p_commercial_id uuid,
  p_changed_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para asignar comerciales'; end if;
  if not exists (select 1 from public.profiles where id = p_commercial_id and company_id = v_company_id and active = true and deleted_at is null and primary_area = 'Comercial') then
    raise exception 'El perfil no es comercial activo de la empresa';
  end if;

  update public.work_orders
  set current_responsible_id = p_commercial_id,
      updated_by = p_changed_by
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  select v_company_id, id, status, status, p_changed_by, 'Asignacion comercial', true
  from public.work_orders where id = p_work_order_id;
end;
$$;

create or replace function public.create_work_order_full(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_created_by uuid := (p_payload->>'created_by')::uuid;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_site_id uuid := (p_payload->>'site_id')::uuid;
  v_equipment_id uuid := nullif(p_payload->>'main_equipment_id', '')::uuid;
  v_technician_id uuid := nullif(p_payload->>'technician_id', '')::uuid;
  v_id uuid;
  v_code text;
begin
  perform public.assert_member_of_current_company(v_company_id);
  if v_created_by <> public.current_profile_id() then raise exception 'Creador no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then raise exception 'No tienes permisos para crear partes'; end if;
  if not exists (select 1 from public.clients where id = v_client_id and company_id = v_company_id and deleted_at is null) then raise exception 'Cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = v_site_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'Centro no valido'; end if;
  if v_equipment_id is not null and not exists (select 1 from public.equipment where id = v_equipment_id and company_id = v_company_id and client_id = v_client_id and site_id = v_site_id and deleted_at is null) then raise exception 'Equipo no valido'; end if;

  v_code := public.next_dmp_code(v_company_id, 'work_orders', 'PAR', true, 6);
  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, scheduled_date, scheduled_time, estimated_duration_minutes, contact_id, access_requirement_id, planned_material, created_by, created_role, updated_by, current_responsible_id)
  values (v_company_id, v_code, nullif(p_payload->>'case_id', '')::uuid, v_client_id, v_site_id, v_equipment_id, p_payload->>'title', nullif(p_payload->>'description', ''), p_payload->>'type', coalesce(nullif(p_payload->>'priority', ''), 'Normal'), p_payload->>'origin', nullif(p_payload->>'scheduled_date', '')::date, nullif(p_payload->>'scheduled_time', '')::time, nullif(p_payload->>'estimated_duration_minutes', '')::integer, nullif(p_payload->>'contact_id', '')::uuid, nullif(p_payload->>'access_requirement_id', '')::uuid, nullif(p_payload->>'planned_material', ''), v_created_by, p_payload->>'created_role', v_created_by, coalesce(v_technician_id, v_created_by))
  returning id into v_id;

  if v_technician_id is not null then
    perform public.assign_technician(v_id, v_technician_id, coalesce(nullif(p_payload->>'scheduled_date', '')::date, current_date), nullif(p_payload->>'scheduled_time', '')::time, null, 'Principal', v_created_by);
  end if;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (v_company_id, v_id, null, 'Pendiente', v_created_by, 'Creacion transaccional de parte ' || v_code);
  return v_id;
end;
$$;

create or replace function public.save_check_block_result(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.checks;
  v_section_result_id uuid;
  v_item jsonb;
  v_result text := p_payload->>'result';
  v_observations text := nullif(p_payload->>'observations', '');
  v_intervention text := nullif(p_payload->>'intervention', '');
  v_severity text := nullif(p_payload->>'severity', '');
  v_components jsonb := coalesce(p_payload->'components', '[]'::jsonb);
begin
  select * into v_check from public.checks where id = (p_payload->>'check_id')::uuid and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(v_check.work_order_id)) then
    raise exception 'No tienes permisos para guardar este check';
  end if;
  if v_severity is not null and v_severity not in ('Leve','Media','Alta','Critica') then raise exception 'Gravedad no valida'; end if;

  insert into public.check_section_results(company_id, check_id, section_id, result, observations, intervention, severity, components, local_change_id, synced_at)
  values (v_check.company_id, v_check.id, (p_payload->>'section_id')::uuid, v_result, v_observations, v_intervention, v_severity, v_components, nullif(p_payload->>'local_change_id', ''), now())
  on conflict (check_id, section_id) do update set
    result = excluded.result,
    observations = excluded.observations,
    intervention = excluded.intervention,
    severity = excluded.severity,
    components = excluded.components,
    local_change_id = excluded.local_change_id,
    synced_at = now(),
    updated_at = now()
  returning id into v_section_result_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    insert into public.check_item_results(company_id, check_id, section_result_id, item_id, result, observations)
    values (v_check.company_id, v_check.id, v_section_result_id, (v_item->>'id')::uuid, v_result, v_observations)
    on conflict (check_id, item_id) do update set section_result_id = excluded.section_result_id, result = excluded.result, observations = excluded.observations, updated_at = now();
  end loop;

  update public.checks
  set status = 'En curso', global_result = v_result, observations = coalesce(v_observations, observations), started_at = coalesce(started_at, now()), updated_at = now()
  where id = v_check.id;

  return v_section_result_id;
end;
$$;

create or replace function public.superadmin_create_profile(p_profile jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_company_id uuid := coalesce(nullif(p_profile->>'company_id', '')::uuid, public.current_company_id());
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;
  if not exists (select 1 from public.companies where id = v_company_id and active = true) then
    raise exception 'La empresa seleccionada no existe o esta inactiva';
  end if;

  insert into public.profiles(company_id, auth_user_id, first_name, last_name, email, phone, primary_area, active)
  values (
    v_company_id,
    nullif(p_profile->>'auth_user_id', '')::uuid,
    nullif(p_profile->>'first_name', ''),
    nullif(p_profile->>'last_name', ''),
    lower(nullif(p_profile->>'email', '')),
    nullif(p_profile->>'phone', ''),
    coalesce(nullif(p_profile->>'primary_area', ''), 'SAT'),
    coalesce((p_profile->>'active')::boolean, true)
  )
  returning * into v_profile;

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'creacion', 'profiles', v_profile.id, 'Usuario creado desde superadmin');

  return v_profile;
end;
$$;

drop function if exists public.technician_global_search(text);
create function public.technician_global_search(p_query text)
returns table(id uuid, kind text, title text, subtitle text, route text)
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select '%' || replace(coalesce(nullif(trim(p_query), ''), '___empty___'), '%', '') || '%' as q
  ), assigned_work as (
    select distinct wo.id, wo.code, wo.title, wo.description, wo.client_id, wo.site_id, wo.main_equipment_id,
           c.legal_name as client_name, s.name as site_name, e.code as equipment_code
    from public.work_order_assignments a
    join public.work_orders wo on wo.id = a.work_order_id and wo.deleted_at is null
    join public.clients c on c.id = wo.client_id and c.deleted_at is null
    join public.sites s on s.id = wo.site_id and s.deleted_at is null
    left join public.equipment e on e.id = wo.main_equipment_id and e.deleted_at is null
    cross join term
    where a.deleted_at is null
      and public.has_any_role(array['Tecnico'])
      and a.technician_id = public.current_profile_id()
      and a.company_id = public.current_company_id()
      and (wo.code ilike term.q or wo.title ilike term.q or coalesce(wo.description, '') ilike term.q or c.legal_name ilike term.q or s.name ilike term.q or coalesce(e.code, '') ilike term.q)
  ), assigned_checks as (
    select ch.id, ch.code, ch.status, ch.global_result, ch.work_order_id, e.code as equipment_code, wo.code as work_order_code
    from public.checks ch
    left join public.work_orders wo on wo.id = ch.work_order_id and wo.deleted_at is null
    join public.equipment e on e.id = ch.equipment_id and e.deleted_at is null
    cross join term
    where ch.deleted_at is null
      and public.has_any_role(array['Tecnico'])
      and ch.company_id = public.current_company_id()
      and (ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))
      and (ch.code ilike term.q or ch.status ilike term.q or ch.global_result ilike term.q or e.code ilike term.q or coalesce(wo.code, '') ilike term.q)
  )
  select aw.id, 'Parte'::text, aw.code || ' · ' || aw.title, aw.client_name || ' · ' || aw.site_name || coalesce(' · ' || aw.equipment_code, ''), '/app/tecnico/trabajo/' || aw.id::text
  from assigned_work aw
  union all
  select ac.id, 'Check'::text, ac.code, coalesce(ac.equipment_code, 'Equipo') || ' · ' || coalesce(ac.work_order_code, 'Sin parte') || ' · ' || ac.status, '/app/checks/' || ac.id::text
  from assigned_checks ac
  limit 12;
$$;

revoke all on function public.create_case(uuid, uuid, uuid, text, text, text, text, text, text, uuid) from public;
revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid) from public;
revoke all on function public.assign_commercial_work_order(uuid, uuid, uuid) from public;
revoke all on function public.create_work_order_full(jsonb) from public;
revoke all on function public.save_check_block_result(jsonb) from public;
revoke all on function public.superadmin_create_profile(jsonb) from public;
revoke all on function public.technician_global_search(text) from public;

grant execute on function public.create_case(uuid, uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.unassign_work_order_profile(uuid, uuid, uuid) to authenticated;
grant execute on function public.assign_commercial_work_order(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_work_order_full(jsonb) to authenticated;
grant execute on function public.save_check_block_result(jsonb) to authenticated;
grant execute on function public.superadmin_create_profile(jsonb) to authenticated;
grant execute on function public.technician_global_search(text) to authenticated;

commit;
