-- DoorManager Pro - Demo Auth y permisos por rol
-- No crea usuarios Auth. Los usuarios se crean manualmente en Supabase Auth y se enlazan actualizando profiles.auth_user_id.

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.company_id = p_company_id
      and p.active = true
      and p.deleted_at is null
  );
$$;

create or replace function public.has_any_role(role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.auth_user_id = auth.uid()
      and p.active = true
      and r.name = any(role_names)
  );
$$;

create or replace function public.assert_member_of_current_company(p_company_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'El usuario no pertenece a esta empresa';
  end if;
end;
$$;

create or replace function public.create_work_order(
  p_company_id uuid, p_client_id uuid, p_site_id uuid, p_title text, p_type text, p_priority text,
  p_origin text, p_created_by uuid, p_created_role text, p_description text default null, p_case_id uuid default null,
  p_main_equipment_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  perform public.assert_member_of_current_company(p_company_id);
  if not public.has_any_role(array['SAT','Comercial','Gerencia']) then
    raise exception 'No tienes permisos para crear partes';
  end if;
  if p_created_by <> public.current_profile_id() then
    raise exception 'El creador no coincide con el usuario autenticado';
  end if;
  if p_created_role not in ('SAT','Comercial','Gerencia') then
    raise exception 'Rol creador no autorizado';
  end if;
  if p_type not in ('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia') then
    raise exception 'Tipo de parte no valido: %', p_type;
  end if;
  if p_origin not in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema') then
    raise exception 'Origen no valido: %', p_origin;
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and company_id = p_company_id and deleted_at is null) then raise exception 'Cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = p_site_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null) then raise exception 'Centro no valido'; end if;
  if p_main_equipment_id is not null and not exists (select 1 from public.equipment where id = p_main_equipment_id and company_id = p_company_id and client_id = p_client_id and site_id = p_site_id and deleted_at is null) then raise exception 'Equipo no valido'; end if;
  v_code := 'PAR-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, created_by, created_role, updated_by, current_responsible_id)
  values (p_company_id, v_code, p_case_id, p_client_id, p_site_id, p_main_equipment_id, p_title, p_description, p_type, p_priority, p_origin, p_created_by, p_created_role, p_created_by, p_created_by)
  returning id into v_id;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (p_company_id, v_id, null, 'Pendiente', p_created_by, 'Creacion de parte');
  return v_id;
end;
$$;

create or replace function public.assign_technician(
  p_work_order_id uuid, p_technician_id uuid, p_assignment_date date, p_start time, p_end time, p_role text, p_assigned_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not public.has_any_role(array['SAT','Gerencia']) then raise exception 'No tienes permisos para asignar técnicos'; end if;
  if p_assigned_by <> public.current_profile_id() then raise exception 'Asignador no valido'; end if;
  if not public.has_role('Tecnico') and p_technician_id = public.current_profile_id() then null; end if;
  if not exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id join public.profiles p on p.id = pr.profile_id where p.id = p_technician_id and p.company_id = v_company_id and r.name = 'Tecnico') then raise exception 'El perfil no es tecnico de la empresa'; end if;
  if p_role not in ('Principal','Apoyo') then raise exception 'Rol de asignacion no valido'; end if;
  insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, assigned_by)
  values (v_company_id, p_work_order_id, p_technician_id, p_assignment_date, p_start, p_end, p_role, p_assigned_by)
  returning id into v_id;
  update public.work_orders
  set main_technician_id = case when p_role = 'Principal' then p_technician_id else main_technician_id end,
      current_responsible_id = case when p_role = 'Principal' then p_technician_id else current_responsible_id end,
      updated_by = p_assigned_by
  where id = p_work_order_id;
  return v_id;
end;
$$;

create or replace function public.change_work_order_status(
  p_work_order_id uuid, p_new_status text, p_changed_by uuid, p_reason text default null,
  p_manual_correction boolean default false, p_lat numeric default null, p_lng numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_previous text;
begin
  select company_id, status into v_company_id, v_previous from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario de cambio no valido'; end if;
  if not (public.has_any_role(array['SAT','Gerencia']) or exists (select 1 from public.work_order_assignments where work_order_id = p_work_order_id and technician_id = p_changed_by and deleted_at is null)) then
    raise exception 'No tienes permisos para cambiar el estado de este parte';
  end if;
  if p_new_status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado') then
    raise exception 'Estado de parte no valido: %', p_new_status;
  end if;
  if p_new_status = v_previous then return; end if;
  update public.work_orders set status = p_new_status, updated_by = p_changed_by,
    finished_at = case when p_new_status = 'Finalizado tecnicamente' then coalesce(finished_at, now()) else finished_at end,
    sent_at = case when p_new_status = 'Enviado' then coalesce(sent_at, now()) else sent_at end
  where id = p_work_order_id;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction, location_lat, location_lng)
  values (v_company_id, p_work_order_id, v_previous, p_new_status, p_changed_by, p_reason, p_manual_correction, p_lat, p_lng);
end;
$$;

create or replace function public.mark_alert_as_read(p_alert_recipient_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_profile_id <> public.current_profile_id() then raise exception 'Perfil no valido'; end if;
  select company_id into v_company_id from public.alert_recipients where id = p_alert_recipient_id;
  perform public.assert_member_of_current_company(v_company_id);
  update public.alert_recipients
  set is_read = true, read_at = now()
  where id = p_alert_recipient_id
    and (recipient_profile_id = p_profile_id or recipient_role in (select r.name from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p_profile_id));
  if not found then raise exception 'Aviso no encontrado para el destinatario'; end if;
end;
$$;

drop policy if exists profiles_company_policy on public.profiles;
create policy profiles_read_own_company on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id() and active = true and deleted_at is null);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = public.current_profile_id())
  with check (id = public.current_profile_id() and company_id = public.current_company_id());

drop policy if exists clients_company_policy on public.clients;
create policy clients_select_company on public.clients for select to authenticated using (company_id = public.current_company_id() and deleted_at is null);
create policy clients_write_roles on public.clients for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['SAT','Comercial','Gerencia']));
create policy clients_update_roles on public.clients for update to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['SAT','Comercial','Gerencia','Oficina'])) with check (company_id = public.current_company_id());

drop policy if exists sites_company_policy on public.sites;
create policy sites_select_company on public.sites for select to authenticated using (company_id = public.current_company_id() and deleted_at is null);
create policy sites_write_roles on public.sites for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['SAT','Comercial','Gerencia']));
create policy sites_update_roles on public.sites for update to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['SAT','Comercial','Gerencia','Oficina'])) with check (company_id = public.current_company_id());

drop policy if exists equipment_company_policy on public.equipment;
create policy equipment_select_company on public.equipment for select to authenticated using (company_id = public.current_company_id() and deleted_at is null);
create policy equipment_write_roles on public.equipment for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['SAT','Gerencia']));
create policy equipment_update_roles on public.equipment for update to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['SAT','Gerencia','Oficina'])) with check (company_id = public.current_company_id());

drop policy if exists work_orders_company_policy on public.work_orders;
create policy work_orders_select_company on public.work_orders for select to authenticated using (company_id = public.current_company_id() and deleted_at is null);
create policy work_orders_write_roles on public.work_orders for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['SAT','Comercial','Gerencia']));
create policy work_orders_update_roles on public.work_orders for update to authenticated using (company_id = public.current_company_id() and (public.has_any_role(array['SAT','Gerencia','Oficina']) or current_responsible_id = public.current_profile_id())) with check (company_id = public.current_company_id());

drop policy if exists checks_company_policy on public.checks;
create policy checks_select_company on public.checks for select to authenticated using (company_id = public.current_company_id() and deleted_at is null);
create policy checks_write_roles on public.checks for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['SAT','Tecnico','Gerencia']));
create policy checks_update_roles on public.checks for update to authenticated using (company_id = public.current_company_id() and (public.has_any_role(array['SAT','Gerencia']) or technician_id = public.current_profile_id())) with check (company_id = public.current_company_id());

drop policy if exists alerts_company_policy on public.alerts;
create policy alerts_select_company on public.alerts for select to authenticated using (company_id = public.current_company_id() and deleted_at is null);
create policy alerts_write_roles on public.alerts for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['SAT','Comercial','Oficina','Gerencia','Tecnico']));
create policy alerts_update_roles on public.alerts for update to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['SAT','Oficina','Gerencia'])) with check (company_id = public.current_company_id());

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.assert_member_of_current_company(uuid) to authenticated;

comment on column public.profiles.auth_user_id is 'Crear cada usuario demo en Supabase Auth y actualizar este campo con auth.users.id.';
comment on function public.is_company_member(uuid) is 'Valida que auth.uid() corresponde a un perfil activo de la empresa indicada.';

-- Usuarios demo a crear manualmente en Supabase Auth:
-- Marta Lopez: marta.lopez@dmp-demo.test / DemoSAT2026 -> enlazar profile 10000000-0000-0000-0000-000000000001
-- Laura Sanchez: laura.sanchez@dmp-demo.test / DemoCOM2026 -> enlazar profile 10000000-0000-0000-0000-000000000002
-- Elena Ruiz: elena.ruiz@dmp-demo.test / DemoOFI2026 -> enlazar profile 10000000-0000-0000-0000-000000000003
-- Carlos Navarro: carlos.navarro@dmp-demo.test / DemoDIR2026 -> enlazar profile 10000000-0000-0000-0000-000000000004
-- Diego Martin: diego.martin@dmp-demo.test / DemoTEC2026 -> enlazar profile 10000000-0000-0000-0000-000000000005
-- SQL de enlace, sustituyendo cada UUID por el id real de Auth:
-- update public.profiles set auth_user_id = '<auth.users.id>' where email = '<correo>';
