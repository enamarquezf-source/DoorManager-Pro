-- DoorManager Pro - endurece RPC heredadas y vistas expuestas

create or replace function public.change_work_order_status(
  p_work_order_id uuid, p_new_status text, p_changed_by uuid, p_reason text default null,
  p_manual_correction boolean default false, p_lat numeric default null, p_lng numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_previous text;
begin
  if p_new_status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado') then
    raise exception 'Estado de parte no valido';
  end if;

  select company_id, status into v_company_id, v_previous
  from public.work_orders
  where id = p_work_order_id and deleted_at is null
  for update;

  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(p_work_order_id, v_profile_id)) then
    raise exception 'No tienes permisos para cambiar este parte';
  end if;
  if p_new_status = v_previous then return; end if;

  update public.work_orders
  set status = p_new_status,
      updated_by = v_profile_id,
      finished_at = case when p_new_status = 'Finalizado tecnicamente' then coalesce(finished_at, now()) else finished_at end,
      sent_at = case when p_new_status = 'Enviado' then coalesce(sent_at, now()) else sent_at end
  where id = p_work_order_id and company_id = v_company_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction, location_lat, location_lng)
  values (v_company_id, p_work_order_id, v_previous, p_new_status, v_profile_id, p_reason, p_manual_correction, p_lat, p_lng);
end;
$$;

create or replace function public.request_work_order_return(p_work_order_id uuid, p_changed_by uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_previous text;
begin
  select company_id, status into v_company_id, v_previous
  from public.work_orders
  where id = p_work_order_id and deleted_at is null
  for update;

  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(p_work_order_id, v_profile_id)) then
    raise exception 'No tienes permisos para solicitar devolucion';
  end if;
  if exists (select 1 from public.work_order_status_history where work_order_id = p_work_order_id and new_status = 'Devolucion solicitada' and is_active_return_request) then
    raise exception 'Ya existe una solicitud de devolucion activa para este parte';
  end if;

  update public.work_orders
  set status = 'Devolucion solicitada', updated_by = v_profile_id
  where id = p_work_order_id and company_id = v_company_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, is_active_return_request)
  values (v_company_id, p_work_order_id, v_previous, 'Devolucion solicitada', v_profile_id, p_reason, true);
end;
$$;

create or replace function public.finish_check(p_check_id uuid, p_finished_by uuid, p_global_result text, p_observations text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_check public.checks;
begin
  if p_global_result not in ('Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable') then
    raise exception 'Resultado global no valido';
  end if;

  select * into v_check from public.checks where id = p_check_id and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = v_profile_id or public.is_assigned_to_work_order(v_check.work_order_id, v_profile_id)) then
    raise exception 'No tienes permisos para finalizar este check';
  end if;

  update public.checks
  set status = 'Realizado',
      finished_at = now(),
      technician_id = coalesce(technician_id, v_profile_id),
      global_result = p_global_result,
      observations = coalesce(p_observations, observations),
      updated_at = now()
  where id = p_check_id and company_id = v_check.company_id;
end;
$$;

create or replace function public.create_deficiency_from_check(
  p_check_id uuid, p_item_id uuid, p_severity text, p_description text, p_recommended_action text, p_responsible uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_id uuid;
  v_check public.checks;
  v_section_id uuid;
  v_code text;
begin
  if p_severity not in ('Baja','Media','Alta','Critica') then raise exception 'Gravedad no valida'; end if;
  select * into v_check from public.checks where id = p_check_id and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = v_profile_id or public.is_assigned_to_work_order(v_check.work_order_id, v_profile_id)) then
    raise exception 'No tienes permisos para crear deficiencias de este check';
  end if;
  select section_id into v_section_id from public.check_template_items where id = p_item_id;
  if v_section_id is null then raise exception 'Item de check no encontrado'; end if;

  v_code := public.next_dmp_code(v_check.company_id, 'deficiencies', 'DEF', true, 6);
  insert into public.deficiencies(company_id, code, check_id, section_id, item_id, work_order_id, equipment_id, client_id, site_id, severity, description, recommended_action, responsible_profile_id)
  select v_check.company_id, v_code, v_check.id, v_section_id, p_item_id, v_check.work_order_id, e.id, e.client_id, e.site_id, p_severity, p_description, p_recommended_action, p_responsible
  from public.equipment e
  where e.id = v_check.equipment_id
    and e.company_id = v_check.company_id
  returning id into v_id;

  if v_id is null then raise exception 'Equipo de check no valido'; end if;
  return v_id;
end;
$$;

create or replace function public.record_work_order_material_usage(
  p_company_id uuid,
  p_work_order_id uuid,
  p_description text,
  p_quantity numeric default 1,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_material_id uuid;
  v_usage_id uuid;
  v_description text := trim(coalesce(p_description, ''));
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(p_work_order_id, v_profile_id)) then
    raise exception 'No tienes permisos para sincronizar material de este parte';
  end if;
  if v_description = '' then raise exception 'Material obligatorio'; end if;

  select id into v_material_id
  from public.materials
  where company_id = v_company_id and lower(description) = lower(v_description) and deleted_at is null
  limit 1;

  if v_material_id is null then
    insert into public.materials(company_id, code, description, unit, active)
    values (v_company_id, public.next_dmp_code(v_company_id, 'materials', 'MAT', false, 6), v_description, 'ud', true)
    returning id into v_material_id;
  end if;

  insert into public.work_order_materials(company_id, work_order_id, material_id, used_quantity, notes)
  values (v_company_id, p_work_order_id, v_material_id, greatest(coalesce(p_quantity, 1), 0), 'Sincronizado desde modo tecnico offline')
  returning id into v_usage_id;

  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by)
  values (v_company_id, p_work_order_id, 'Material usado: ' || v_description || ' · Cantidad: ' || greatest(coalesce(p_quantity, 1), 0)::text, 'Tecnica', v_profile_id);

  return v_usage_id;
end;
$$;

create or replace function public.superadmin_save_profile_with_roles(p_profile_id uuid default null, p_profile jsonb default '{}'::jsonb, p_role_names text[] default array[]::text[])
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_company_id uuid := coalesce(nullif(p_profile->>'company_id', '')::uuid, public.current_company_id());
  v_roles text[] := case when array_length(p_role_names, 1) is null then array[coalesce(nullif(p_profile->>'primary_area', ''), 'SAT')] else p_role_names end;
  v_role_count integer;
begin
  if not public.is_superadmin() then raise exception 'No tienes permiso para gestionar usuarios'; end if;
  if v_company_id <> public.current_company_id() then raise exception 'No puedes gestionar usuarios fuera de tu empresa'; end if;
  if exists (select 1 from unnest(v_roles) role_name where role_name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then
    raise exception 'Rol no valido';
  end if;
  if coalesce(array_length(v_roles, 1), 0) = 0 then raise exception 'Debe indicar al menos un rol'; end if;

  if p_profile_id is null then
    insert into public.profiles(company_id, auth_user_id, first_name, last_name, email, phone, primary_area, active)
    values (v_company_id, nullif(p_profile->>'auth_user_id', '')::uuid, nullif(p_profile->>'first_name', ''), nullif(p_profile->>'last_name', ''), lower(nullif(p_profile->>'email', '')), nullif(p_profile->>'phone', ''), coalesce(nullif(p_profile->>'primary_area', ''), 'SAT'), coalesce((p_profile->>'active')::boolean, true))
    returning * into v_profile;
  else
    update public.profiles
    set first_name = coalesce(nullif(p_profile->>'first_name', ''), first_name),
        last_name = coalesce(nullif(p_profile->>'last_name', ''), last_name),
        email = coalesce(lower(nullif(p_profile->>'email', '')), email),
        phone = case when p_profile ? 'phone' then nullif(p_profile->>'phone', '') else phone end,
        auth_user_id = case when p_profile ? 'auth_user_id' then nullif(p_profile->>'auth_user_id', '')::uuid else auth_user_id end,
        primary_area = coalesce(nullif(p_profile->>'primary_area', ''), primary_area),
        active = coalesce((p_profile->>'active')::boolean, active),
        deleted_at = case when p_profile ? 'deleted_at' then nullif(p_profile->>'deleted_at', '')::timestamptz else deleted_at end
    where id = p_profile_id and company_id = v_company_id
    returning * into v_profile;
  end if;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  select count(*) into v_role_count from public.roles where name = any(v_roles);
  if v_role_count <> array_length(v_roles, 1) then raise exception 'Alguno de los roles no existe'; end if;

  delete from public.profile_roles where profile_id = v_profile.id;
  insert into public.profile_roles(profile_id, role_id)
  select v_profile.id, r.id from public.roles r where r.name = any(v_roles);

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'modificacion', 'profiles', v_profile.id, 'Perfil y roles guardados transaccionalmente desde superadmin');

  return v_profile;
end;
$$;

alter view if exists public.v_technician_daily_schedule set (security_invoker = true);
alter view if exists public.v_open_work_orders set (security_invoker = true);
alter view if exists public.v_work_order_full_detail set (security_invoker = true);
alter view if exists public.v_equipment_history set (security_invoker = true);
alter view if exists public.v_pending_checks set (security_invoker = true);
alter view if exists public.v_completed_checks set (security_invoker = true);
alter view if exists public.v_unread_alerts set (security_invoker = true);
alter view if exists public.v_sat_dashboard set (security_invoker = true);
alter view if exists public.v_management_metrics set (security_invoker = true);

grant execute on function public.change_work_order_status(uuid, text, uuid, text, boolean, numeric, numeric) to authenticated;
grant execute on function public.request_work_order_return(uuid, uuid, text) to authenticated;
grant execute on function public.finish_check(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_deficiency_from_check(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.record_work_order_material_usage(uuid, uuid, text, numeric, uuid) to authenticated;
grant execute on function public.superadmin_save_profile_with_roles(uuid, jsonb, text[]) to authenticated;
