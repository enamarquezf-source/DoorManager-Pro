-- DoorManager Pro - alcance seguro para perfil tecnico

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

alter function public.technician_global_search(text) owner to postgres;
grant execute on function public.technician_global_search(text) to authenticated;

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
join public.work_orders wo on wo.id = a.work_order_id and wo.deleted_at is null
join public.clients c on c.id = wo.client_id and c.deleted_at is null
join public.sites s on s.id = wo.site_id and s.deleted_at is null
left join public.equipment e on e.id = wo.main_equipment_id and e.deleted_at is null
left join public.access_requirements ar on ar.id = wo.access_requirement_id
left join lateral (
  select
    count(*) filter (where ch.status <> 'Realizado')::integer as pending_checks_count,
    array_agg(ch.status order by ch.created_at desc) as check_statuses,
    array_agg(ch.id order by ch.created_at desc) filter (where ch.status <> 'Realizado') as pending_check_ids,
    (array_agg(ch.status order by ch.created_at desc))[1] as first_check_status
  from public.checks ch
  where ch.work_order_id = wo.id
    and ch.deleted_at is null
    and (ch.technician_id = a.technician_id or ch.technician_id is null)
) checks on true
where a.deleted_at is null;

drop policy if exists clients_select_company on public.clients;
drop policy if exists sites_select_company on public.sites;
drop policy if exists equipment_select_company on public.equipment;
drop policy if exists clients_select_technician_linked on public.clients;
drop policy if exists sites_select_technician_linked on public.sites;
drop policy if exists equipment_select_technician_linked on public.equipment;

create policy clients_select_technician_linked on public.clients for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and exists (
    select 1 from public.work_orders wo
    join public.work_order_assignments a on a.work_order_id = wo.id and a.deleted_at is null
    where wo.client_id = clients.id and wo.deleted_at is null and a.technician_id = public.current_profile_id()
  ));

create policy sites_select_technician_linked on public.sites for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and exists (
    select 1 from public.work_orders wo
    join public.work_order_assignments a on a.work_order_id = wo.id and a.deleted_at is null
    where wo.site_id = sites.id and wo.deleted_at is null and a.technician_id = public.current_profile_id()
  ));

create policy equipment_select_technician_linked on public.equipment for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and exists (
    select 1 from public.work_orders wo
    join public.work_order_assignments a on a.work_order_id = wo.id and a.deleted_at is null
    where wo.main_equipment_id = equipment.id and wo.deleted_at is null and a.technician_id = public.current_profile_id()
  ));

drop policy if exists alerts_insert_authorized on public.alerts;
drop policy if exists alert_recipients_insert_authorized on public.alert_recipients;
create policy alerts_insert_authorized on public.alerts for insert to authenticated
  with check (company_id = public.current_company_id() and created_by = public.current_profile_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
create policy alert_recipients_insert_authorized on public.alert_recipients for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
