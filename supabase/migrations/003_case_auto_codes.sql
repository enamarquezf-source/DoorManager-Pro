-- DoorManager Pro - codigos automaticos transaccionales para expedientes

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

grant execute on function public.create_case(uuid, uuid, uuid, text, text, text, text, text, text, uuid) to authenticated;

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
  v_type text;
  v_self_commercial_visit boolean;
begin
  select company_id, type into v_company_id, v_type from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;

  perform public.assert_member_of_current_company(v_company_id);

  v_self_commercial_visit := v_type = 'Visita comercial'
    and p_technician_id = p_assigned_by
    and public.has_role('Comercial');

  if not (public.has_any_role(array['SAT','Gerencia']) or v_self_commercial_visit) then
    raise exception 'No tienes permisos para asignar tecnicos';
  end if;

  if p_assigned_by <> public.current_profile_id() then raise exception 'Asignador no valido'; end if;

  if not v_self_commercial_visit and not exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.id = p_technician_id
      and p.company_id = v_company_id
      and r.name = 'Tecnico'
      and p.active = true
      and p.deleted_at is null
  ) then
    raise exception 'El perfil no es tecnico de la empresa';
  end if;

  if p_role not in ('Principal','Apoyo') then raise exception 'Rol de asignacion no valido'; end if;

  insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, assigned_by)
  values (v_company_id, p_work_order_id, p_technician_id, p_assignment_date, p_start, p_end, p_role, p_assigned_by)
  returning id into v_id;

  update public.work_orders
  set main_technician_id = case when p_role = 'Principal' then p_technician_id else main_technician_id end,
      current_responsible_id = case when p_role = 'Principal' then p_technician_id else current_responsible_id end,
      updated_by = p_assigned_by
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  select v_company_id, p_work_order_id, status, status, p_assigned_by,
    case when v_self_commercial_visit then 'Autoasignacion de visita comercial' else 'Asignacion de tecnico' end
  from public.work_orders
  where id = p_work_order_id;

  return v_id;
end;
$$;

grant execute on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) to authenticated;
