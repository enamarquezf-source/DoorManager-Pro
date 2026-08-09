-- DoorManager Pro - correccion operativa post 023
-- Idempotente. No modifica migraciones anteriores, redefine RPC/vistas afectadas.

begin;

create or replace function public.dmp024_active_profile()
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

create or replace function public.dmp024_is_work_order_active_status(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material');
$$;

create or replace function public.dmp024_can_commercial_operate(p_work public.work_orders, p_profile public.profiles)
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

drop policy if exists work_order_time_entries_select_scoped on public.work_order_time_entries;
create policy work_order_time_entries_select_scoped on public.work_order_time_entries for select to authenticated
  using (
    (company_id = public.current_company_id()
      and (
        public.has_any_role(array['superadmin','SAT','Gerencia','Comercial'])
        or profile_id = public.current_profile_id()
        or exists (select 1 from public.work_order_assignments a where a.work_order_id = work_order_time_entries.work_order_id and a.technician_id = public.current_profile_id() and a.deleted_at is null and a.status not in ('Finalizado','Cancelado'))
      ))
    or public.is_platform_superadmin()
  );

create or replace function public.dmp024_assert_work_order_operator(p_work_order_id uuid, p_manage_other_profile boolean default false)
returns public.work_orders
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_work.id is null then raise exception 'parte: work_order_id no existe o esta archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);

  if v_work.status in ('Cerrado','Cancelado') then
    raise exception 'estado editable: el parte esta % y no admite horas/materiales', v_work.status;
  end if;

  if v_admin then return v_work; end if;
  if p_manage_other_profile then raise exception 'permiso: solo SAT, Gerencia o superadmin pueden gestionar registros de otros trabajadores'; end if;

  if public.has_any_role(array['Tecnico']) then
    if public.dmp024_is_work_order_active_status(v_work.status) and exists (
      select 1 from public.work_order_assignments a
      where a.work_order_id = v_work.id
        and a.technician_id = v_profile.id
        and a.deleted_at is null
        and a.status not in ('Finalizado','Cancelado')
    ) then
      return v_work;
    end if;
    raise exception 'asignacion: tecnico sin asignacion activa para este parte operativo';
  end if;

  if public.has_any_role(array['Comercial']) and public.dmp024_can_commercial_operate(v_work, v_profile) then return v_work; end if;

  raise exception 'permiso: rol sin permiso para gestionar horas/materiales de este parte';
end;
$$;

create or replace function public.dmp024_work_minutes(p_start time, p_end time, p_break integer, p_manual integer)
returns integer
language plpgsql
immutable
as $$
declare
  v_raw integer;
  v_break integer := greatest(coalesce(p_break, 0), 0);
begin
  if p_start is not null or p_end is not null then
    if p_start is null or p_end is null then raise exception 'validacion del formulario: indica inicio y fin, o usa duracion manual'; end if;
    if p_end <= p_start then raise exception 'validacion del formulario: la hora de fin debe ser posterior a la hora de inicio'; end if;
    v_raw := floor(extract(epoch from (p_end - p_start)) / 60)::integer;
    if v_break >= v_raw then raise exception 'validacion del formulario: la pausa debe ser menor que la duracion total'; end if;
    return v_raw - v_break;
  end if;
  if coalesce(p_manual, 0) <= 0 then raise exception 'validacion del formulario: indica una duracion manual mayor que cero'; end if;
  return p_manual;
end;
$$;

create or replace function public.dmp_diagnose_work_order_operation(p_work_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_work.id is null then return jsonb_build_object('ok', false, 'phase', 'parte', 'message', 'Parte no encontrado o archivado'); end if;
  return jsonb_build_object(
    'ok', true,
    'phase', 'diagnostico',
    'work_order_status', v_work.status,
    'active_assignment', exists (select 1 from public.work_order_assignments a where a.work_order_id = v_work.id and a.technician_id = v_profile.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')),
    'active_operational_status', public.dmp024_is_work_order_active_status(v_work.status),
    'admin_role', public.has_any_role(array['superadmin','SAT','Gerencia']),
    'commercial_scope', public.dmp024_can_commercial_operate(v_work, v_profile)
  );
end;
$$;

create or replace function public.dmp_upsert_work_order_time_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_profile_id uuid := coalesce(nullif(p_payload->>'profile_id', '')::uuid, v_profile.id);
  v_target public.profiles;
  v_duration integer;
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, v_profile_id <> v_profile.id);
  select * into v_target from public.profiles where id = v_profile_id and active = true and deleted_at is null;
  if v_target.id is null then raise exception 'perfil activo: trabajador no encontrado o inactivo'; end if;
  if v_target.company_id is distinct from v_work.company_id and not (v_target.id = v_profile.id and public.is_platform_superadmin()) then
    raise exception 'empresa: el trabajador no pertenece a la empresa del parte';
  end if;
  if v_profile_id <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no puedes registrar horas de otro trabajador'; end if;

  v_duration := public.dmp024_work_minutes(nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), nullif(p_payload->>'duration_minutes', '')::integer);
  if trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'validacion del formulario: describe el trabajo realizado'; end if;

  if v_id is not null then
    if not exists (select 1 from public.work_order_time_entries where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and (profile_id = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia']))) then raise exception 'permiso: registro de horas no editable para este usuario'; end if;
    update public.work_order_time_entries set profile_id = v_profile_id, work_date = coalesce(nullif(p_payload->>'work_date', '')::date, work_date), started_at = nullif(p_payload->>'started_at', '')::time, ended_at = nullif(p_payload->>'ended_at', '')::time, break_minutes = coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), duration_minutes = v_duration, manual_duration = nullif(p_payload->>'started_at', '') is null, hour_type = coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), description = trim(p_payload->>'description'), updated_at = now() where id = v_id;
    return v_id;
  end if;

  insert into public.work_order_time_entries(company_id, work_order_id, profile_id, work_date, started_at, ended_at, break_minutes, duration_minutes, manual_duration, hour_type, description, created_by)
  values (v_work.company_id, v_work.id, v_profile_id, coalesce(nullif(p_payload->>'work_date', '')::date, current_date), nullif(p_payload->>'started_at', '')::time, nullif(p_payload->>'ended_at', '')::time, coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0), v_duration, nullif(p_payload->>'started_at', '') is null, coalesce(nullif(p_payload->>'hour_type', ''), 'normal'), trim(p_payload->>'description'), v_profile.id)
  returning id into v_id;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.dmp_upsert_work_order_material(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_material uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_material_row public.materials;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'used_quantity', '')::numeric, 1);
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if trim(coalesce(p_payload->>'unit', 'ud')) = '' then raise exception 'validacion del formulario: indica una unidad'; end if;
  if v_material is not null then
    select * into v_material_row from public.materials where id = v_material and deleted_at is null;
    if v_material_row.id is null or (v_material_row.company_id is not null and v_material_row.company_id <> v_work.company_id) then raise exception 'empresa: material no valido para la empresa del parte'; end if;
  end if;
  if v_material is null and trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'validacion del formulario: indica material de catalogo o descripcion no catalogada'; end if;

  if v_local is not null then
    if exists (select 1 from public.work_order_materials where company_id = v_work.company_id and local_change_id = v_local and work_order_id <> v_work.id) then raise exception 'insercion: el identificador local ya pertenece a otro parte'; end if;
    select id into v_id from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local;
  end if;
  if v_id is not null then
    if not exists (select 1 from public.work_order_materials where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and (registered_by = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia']))) then raise exception 'permiso: material no editable para este usuario'; end if;
    update public.work_order_materials set material_id = v_material, description = nullif(p_payload->>'description', ''), used_quantity = v_quantity, unit = coalesce(nullif(p_payload->>'unit', ''), unit, 'ud'), unit_price = case when public.has_any_role(array['superadmin','SAT','Gerencia']) then coalesce(nullif(p_payload->>'unit_price', '')::numeric, unit_price, 0) else unit_price end, notes = nullif(p_payload->>'notes', ''), registered_by = coalesce(registered_by, v_profile.id), used_at = coalesce(nullif(p_payload->>'used_at', '')::date, used_at, current_date), updated_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.work_order_materials(company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit, unit_price, notes, registered_by, used_at, local_change_id)
  values (v_work.company_id, v_work.id, v_material, nullif(p_payload->>'description', ''), 0, v_quantity, coalesce(nullif(p_payload->>'unit', ''), 'ud'), case when public.has_any_role(array['superadmin','SAT','Gerencia']) then coalesce(nullif(p_payload->>'unit_price', '')::numeric, 0) else 0 end, nullif(p_payload->>'notes', ''), v_profile.id, coalesce(nullif(p_payload->>'used_at', '')::date, current_date), v_local)
  returning id into v_id;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.dmp_change_work_order_status(p_work_order_id uuid, p_new_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
  v_commercial boolean := public.has_any_role(array['Comercial']);
  v_manual boolean := false;
begin
  if p_new_status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado') then raise exception 'validacion del formulario: estado de parte no valido'; end if;
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not v_admin and not (v_commercial and public.dmp024_can_commercial_operate(v_work, v_profile)) and not (public.has_any_role(array['Tecnico']) and exists (select 1 from public.work_order_assignments a where a.work_order_id = v_work.id and a.technician_id = v_profile.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')) and p_new_status in ('Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente')) then
    raise exception 'permiso: no tienes permiso para seleccionar ese estado';
  end if;
  if v_work.status = p_new_status then return; end if;
  v_manual := p_new_status in ('Pendiente','Cancelado','Devuelto por SAT','Cerrado') or array_position(array['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado'], p_new_status) < array_position(array['Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado'], v_work.status);
  if v_manual and trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio para retrocesos, cancelaciones, cierres o correcciones'; end if;

  update public.work_orders set status = p_new_status, updated_by = v_profile.id, updated_at = now(), finished_at = case when p_new_status = 'Finalizado tecnicamente' then coalesce(finished_at, now()) when public.dmp024_is_work_order_active_status(p_new_status) then null else finished_at end, sent_at = case when p_new_status = 'Enviado' then coalesce(sent_at, now()) when p_new_status in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio') then null else sent_at end where id = p_work_order_id;

  if p_new_status = 'Finalizado tecnicamente' and public.has_any_role(array['Tecnico']) and not v_admin then
    update public.work_order_assignments set status = 'Finalizado', updated_at = now() where work_order_id = p_work_order_id and technician_id = v_profile.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  end if;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_work.company_id, v_work.id, v_work.status, p_new_status, v_profile.id, nullif(p_reason, ''), v_manual);
end;
$$;

create or replace function public.unassign_work_order_profile(p_work_order_id uuid, p_profile_id uuid, p_changed_by uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_code text;
  v_status text;
begin
  select company_id, code, status into v_company_id, v_code, v_status from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'perfil activo: usuario de cambio no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permisos para gestionar asignaciones'; end if;

  update public.work_order_assignments set deleted_at = now(), status = 'Cancelado', updated_at = now() where work_order_id = p_work_order_id and technician_id = p_profile_id and deleted_at is null;
  update public.work_orders set main_technician_id = case when main_technician_id = p_profile_id then null else main_technician_id end, updated_by = p_changed_by, updated_at = now() where id = p_work_order_id;
  update public.checks set technician_id = null, updated_at = now() where work_order_id = p_work_order_id and technician_id = p_profile_id and deleted_at is null and status <> 'Realizado';

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  values (v_company_id, p_work_order_id, v_status, v_status, p_changed_by, coalesce(nullif(p_reason, ''), 'Desasignacion tecnica en parte ' || v_code || '. Checks no realizados quedan sin tecnico.'), true);
end;
$$;

create or replace view public.v_technician_daily_schedule
with (security_invoker = true) as
select
  a.company_id,
  a.id as assignment_id,
  a.assignment_date,
  a.planned_start_time,
  a.planned_end_time,
  a.status as assignment_status,
  a.role as assignment_role,
  p.id as technician_id,
  trim(p.first_name || ' ' || p.last_name) as technician_name,
  wo.id as work_order_id,
  wo.code as work_order_code,
  wo.code,
  wo.title,
  wo.description,
  wo.description as work_order_description,
  wo.type,
  wo.priority,
  wo.status as work_order_status,
  wo.scheduled_date,
  wo.scheduled_time,
  wo.planned_material,
  c.id as client_id,
  c.legal_name as client_name,
  s.id as site_id,
  s.name as site_name,
  s.address as site_address,
  e.id as equipment_id,
  e.code as equipment_code,
  ar.description as access_description,
  checks.pending_checks_count,
  checks.check_statuses,
  checks.pending_check_ids,
  checks.first_check_status as check_status
from public.work_order_assignments a
join public.profiles p on p.id = a.technician_id and p.active = true and p.deleted_at is null
join public.work_orders wo on wo.id = a.work_order_id and wo.deleted_at is null and public.dmp024_is_work_order_active_status(wo.status)
join public.clients c on c.id = wo.client_id and c.deleted_at is null
join public.sites s on s.id = wo.site_id and s.deleted_at is null
left join public.equipment e on e.id = wo.main_equipment_id and e.deleted_at is null
left join public.access_requirements ar on ar.id = wo.access_requirement_id
left join lateral (
  select count(*) filter (where ch.status <> 'Realizado')::integer as pending_checks_count,
         array_agg(ch.status order by ch.created_at desc) as check_statuses,
         array_agg(ch.id order by ch.created_at desc) filter (where ch.status <> 'Realizado') as pending_check_ids,
         (array_agg(ch.status order by ch.created_at desc))[1] as first_check_status
  from public.checks ch
  where ch.work_order_id = wo.id and ch.deleted_at is null and ch.status <> 'Realizado' and (ch.technician_id = a.technician_id or ch.technician_id is null)
) checks on true
where a.deleted_at is null and a.status not in ('Finalizado','Cancelado');

create or replace view public.v_pending_checks
with (security_invoker = true) as
select ch.*, e.code as equipment_code, wo.code as work_order_code
from public.checks ch
join public.equipment e on e.id = ch.equipment_id
left join public.work_orders wo on wo.id = ch.work_order_id
where ch.deleted_at is null and ch.status in ('Por realizar','En curso') and (wo.id is null or (wo.deleted_at is null and public.dmp024_is_work_order_active_status(wo.status))) and (ch.technician_id is null or exists (select 1 from public.work_order_assignments a where a.work_order_id = ch.work_order_id and a.technician_id = ch.technician_id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')));

create or replace function public.technician_global_search(p_query text)
returns table(id uuid, kind text, title text, subtitle text, route text)
language sql
stable
security invoker
set search_path = public
as $$
  with term as (select '%' || replace(coalesce(nullif(trim(p_query), ''), '___empty___'), '%', '') || '%' as q),
  assigned_work as (
    select distinct wo.id, wo.code, wo.title, wo.description, c.legal_name as client_name, s.name as site_name, e.code as equipment_code
    from public.work_order_assignments a
    join public.work_orders wo on wo.id = a.work_order_id and wo.deleted_at is null and public.dmp024_is_work_order_active_status(wo.status)
    join public.clients c on c.id = wo.client_id and c.deleted_at is null
    join public.sites s on s.id = wo.site_id and s.deleted_at is null
    left join public.equipment e on e.id = wo.main_equipment_id and e.deleted_at is null
    cross join term
    where a.deleted_at is null and a.status not in ('Finalizado','Cancelado') and a.technician_id = public.current_profile_id() and a.company_id = public.current_company_id() and (wo.code ilike term.q or wo.title ilike term.q or coalesce(wo.description, '') ilike term.q or c.legal_name ilike term.q or s.name ilike term.q or coalesce(e.code, '') ilike term.q)
  ), assigned_checks as (
    select ch.id, ch.code, ch.status, ch.global_result, ch.work_order_id, e.code as equipment_code, wo.code as work_order_code
    from public.checks ch
    join public.work_orders wo on wo.id = ch.work_order_id and wo.deleted_at is null and public.dmp024_is_work_order_active_status(wo.status)
    join public.work_order_assignments a on a.work_order_id = wo.id and a.technician_id = public.current_profile_id() and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')
    join public.equipment e on e.id = ch.equipment_id and e.deleted_at is null
    cross join term
    where ch.deleted_at is null and ch.status in ('Por realizar','En curso') and ch.company_id = public.current_company_id() and (ch.technician_id = public.current_profile_id() or ch.technician_id is null) and (ch.code ilike term.q or ch.status ilike term.q or ch.global_result ilike term.q or e.code ilike term.q or wo.code ilike term.q)
  )
  select aw.id, 'Parte'::text, aw.code || ' · ' || aw.title, aw.client_name || ' · ' || aw.site_name || coalesce(' · ' || aw.equipment_code, ''), '/app/tecnico/trabajo/' || aw.id::text from assigned_work aw
  union all
  select ac.id, 'Check'::text, ac.code, coalesce(ac.equipment_code, 'Equipo') || ' · ' || coalesce(ac.work_order_code, 'Sin parte') || ' · ' || ac.status, '/app/checks/' || ac.id::text from assigned_checks ac
  limit 12;
$$;

revoke all on function public.dmp024_active_profile() from public;
revoke all on function public.dmp024_assert_work_order_operator(uuid, boolean) from public;
revoke all on function public.dmp024_work_minutes(time, time, integer, integer) from public;
revoke all on function public.dmp024_can_commercial_operate(public.work_orders, public.profiles) from public;
revoke all on function public.dmp024_is_work_order_active_status(text) from public;
revoke all on function public.dmp_diagnose_work_order_operation(uuid) from public;
revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_material(jsonb) from public;
revoke all on function public.dmp_change_work_order_status(uuid, text, text) from public;
revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid, text) from public;
revoke all on function public.technician_global_search(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.dmp024_active_profile() from anon;
    revoke all on function public.dmp024_assert_work_order_operator(uuid, boolean) from anon;
    revoke all on function public.dmp024_work_minutes(time, time, integer, integer) from anon;
    revoke all on function public.dmp024_can_commercial_operate(public.work_orders, public.profiles) from anon;
    revoke all on function public.dmp024_is_work_order_active_status(text) from anon;
    revoke all on function public.dmp_diagnose_work_order_operation(uuid) from anon;
    revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from anon;
    revoke all on function public.dmp_upsert_work_order_material(jsonb) from anon;
    revoke all on function public.dmp_change_work_order_status(uuid, text, text) from anon;
    revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid, text) from anon;
    revoke all on function public.technician_global_search(text) from anon;
  end if;
end;
$$;

revoke all on function public.dmp024_active_profile() from authenticated;
revoke all on function public.dmp024_assert_work_order_operator(uuid, boolean) from authenticated;
revoke all on function public.dmp024_work_minutes(time, time, integer, integer) from authenticated;
revoke all on function public.dmp024_can_commercial_operate(public.work_orders, public.profiles) from authenticated;
revoke all on function public.dmp024_is_work_order_active_status(text) from authenticated;

grant execute on function public.dmp_diagnose_work_order_operation(uuid) to authenticated;
grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated;
grant execute on function public.dmp_upsert_work_order_material(jsonb) to authenticated;
grant execute on function public.dmp_change_work_order_status(uuid, text, text) to authenticated;
grant execute on function public.unassign_work_order_profile(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.technician_global_search(text) to authenticated;

commit;
