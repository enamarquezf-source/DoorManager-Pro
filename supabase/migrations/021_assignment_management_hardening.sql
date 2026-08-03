-- Harden work order assignment management: no physical deletes, no implicit reassignment to the actor.
-- Canonical rule: main_technician_id/work_order_assignments are technical assignment; current_responsible_id is commercial/admin responsibility only.
-- Data reconciliation decision: technical responsibilities are cleared; SAT/Gerencia/Oficina administrative responsibilities are preserved and rendered as Responsable.

drop function if exists public.unassign_work_order_profile(uuid, uuid, uuid);
drop function if exists public.unassign_work_order_profile(uuid, uuid, uuid, text);

create or replace function public.unassign_work_order_profile(
  p_work_order_id uuid,
  p_profile_id uuid,
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
  v_assignment_role text;
  v_is_commercial boolean := false;
begin
  select company_id, code, status into v_company_id, v_code, v_status
  from public.work_orders
  where id = p_work_order_id and deleted_at is null
  for update;

  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para gestionar asignaciones'; end if;

  if exists (select 1 from public.profiles p where p.id = p_profile_id and p.company_id = v_company_id and p.active = true and p.deleted_at is null and p.primary_area = 'Comercial') then
    v_is_commercial := true;
  end if;

  select role into v_assignment_role
  from public.work_order_assignments
  where work_order_id = p_work_order_id and technician_id = p_profile_id and deleted_at is null
  order by role = 'Principal' desc, assigned_at desc
  limit 1;

  update public.work_order_assignments
  set deleted_at = now(), status = 'Cancelado', updated_at = now()
  where work_order_id = p_work_order_id
    and technician_id = p_profile_id
    and deleted_at is null;

  update public.work_orders
  set main_technician_id = case when main_technician_id = p_profile_id then null else main_technician_id end,
      current_responsible_id = case when current_responsible_id = p_profile_id then null else current_responsible_id end,
      updated_by = p_changed_by,
      updated_at = now()
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  values (v_company_id, p_work_order_id, v_status, v_status, p_changed_by,
    coalesce(nullif(p_reason, ''), 'Desasignacion de ' || case when v_assignment_role = 'Principal' then 'tecnico principal' when v_assignment_role = 'Apoyo' then 'tecnico de apoyo' when v_is_commercial then 'comercial' else 'perfil' end || ' en parte ' || v_code), true);
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
  v_assignment_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_assigned_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para asignar tecnicos'; end if;
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
      updated_by = p_changed_by,
      updated_at = now()
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  values (v_company_id, p_work_order_id, v_status, v_status, p_changed_by, coalesce(nullif(p_reason, ''), 'Gestion de asignaciones del parte ' || v_code), true);
end;
$$;

with cleared as (
  update public.work_orders wo
  set current_responsible_id = null,
      updated_at = now()
  from public.profiles p
  where wo.current_responsible_id = p.id
    and wo.deleted_at is null
    and (p.primary_area = 'Tecnico' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Tecnico'))
  returning wo.company_id, wo.id, wo.status, wo.code
)
insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
select company_id, id, status, status, null::uuid, 'Reconciliacion 021: current_responsible_id tecnico eliminado; main_technician_id conserva el tecnico principal', true
from cleared;

with demoted as (
  update public.work_order_assignments a
  set role = 'Apoyo', updated_at = now()
  from public.work_orders wo
  where a.work_order_id = wo.id
    and a.deleted_at is null
    and a.role = 'Principal'
    and wo.deleted_at is null
    and wo.main_technician_id is not null
    and a.technician_id <> wo.main_technician_id
    and exists (
      select 1
      from public.work_order_assignments active
      where active.work_order_id = wo.id
        and active.deleted_at is null
        and active.role = 'Principal'
      group by active.work_order_id
      having count(distinct active.technician_id) > 1
    )
  returning wo.company_id, wo.id, wo.status, wo.code, a.technician_id
)
insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
select distinct company_id, id, status, status, null::uuid, 'Reconciliacion 021: principal no vigente convertido a apoyo segun main_technician_id', true
from demoted;

revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid, text) from public;
revoke all on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) from public;
revoke all on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid, text) from anon;
    revoke all on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) from anon;
    revoke all on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) from anon;
  end if;
end;
$$;
grant execute on function public.unassign_work_order_profile(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) to authenticated;
grant execute on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) to authenticated;
