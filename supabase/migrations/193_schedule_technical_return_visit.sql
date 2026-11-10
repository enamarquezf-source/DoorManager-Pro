-- Reabre y asigna una nueva intervención en una única transacción.
begin;

create or replace function public.dmp_schedule_work_order_return_visit(
  p_work_order_id uuid, p_technician_id uuid, p_date date, p_time time, p_reason text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.profiles := public.dmp024_active_profile();
  work public.work_orders;
  previous jsonb;
  reason text := trim(coalesce(p_reason, ''));
begin
  if not coalesce(public.has_any_role(array['SAT','Gerencia','superadmin']), false) then
    raise exception 'permiso: no tienes permiso para programar una nueva visita';
  end if;
  if p_date is null or p_technician_id is null or reason = '' then
    raise exception 'validacion del formulario: indica técnico, fecha y motivo de la nueva visita';
  end if;

  select * into work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if not found then raise exception 'parte: parte no disponible'; end if;
  perform public.assert_member_of_current_company(work.company_id);
  if work.status not in ('Finalizado tecnicamente', 'Devuelto por SAT') then
    raise exception 'estado editable: el parte ya no está pendiente de revisión o devolución';
  end if;
  if work.economic_status in ('facturado', 'cobrado') or exists (
    select 1 from public.invoice_work_orders link
    join public.invoices invoice on invoice.id = link.invoice_id
    where link.work_order_id = work.id and link.deleted_at is null
      and invoice.status <> 'cancelada'
  ) then raise exception 'estado editable: el parte tiene una factura vinculada'; end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_technician_id
      and p.company_id = work.company_id and p.active and p.deleted_at is null
      and (p.primary_area = 'Tecnico' or exists (
        select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id
        where pr.profile_id = p.id and r.name = 'Tecnico'
      ))
  ) then raise exception 'permiso: el técnico debe estar activo y pertenecer a la empresa'; end if;

  previous := to_jsonb(work);
  update public.work_order_assignments set status = 'Finalizado', updated_at = now()
  where work_order_id = work.id and deleted_at is null and status not in ('Finalizado','Cancelado');

  update public.work_orders set
    status = 'Pendiente', main_technician_id = p_technician_id, current_responsible_id = p_technician_id,
    scheduled_date = p_date, scheduled_time = p_time, finished_at = null, sent_at = null,
    sat_review_status = 'not_started', sat_review_destination = null, sat_review_flags = '{}'::jsonb,
    sat_review_reason = null, sat_reviewed_at = null, sat_reviewed_by = null,
    commercial_review_status = 'not_started', commercial_review_reason = null,
    commercial_reviewed_at = null, commercial_reviewed_by = null,
    office_validation_status = 'rejected', office_validation_reason = reason,
    office_validated_at = null, office_validated_by = null,
    economic_review_status = 'pending', economic_review_reason = null,
    economic_reviewed_at = null, economic_reviewed_by = null, economic_status = 'pendiente_validacion',
    updated_at = now(), updated_by = actor.id
  where id = work.id returning * into work;

  insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date,
    planned_start_time, role, status, assigned_by)
  values(work.company_id, work.id, p_technician_id, p_date, p_time, 'Principal', 'Asignado', actor.id)
  on conflict (work_order_id, technician_id, assignment_date) do update set
    deleted_at = null, planned_start_time = excluded.planned_start_time, planned_end_time = null,
    role = 'Principal', status = 'Asignado', assigned_by = excluded.assigned_by, updated_at = now();

  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by)
  values(work.company_id, work.id, 'Nueva visita: ' || reason, 'Tecnica', actor.id);
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  values(work.company_id, work.id, previous->>'status', work.status, actor.id, 'Nueva visita: ' || reason, false);
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values(work.company_id, 'work_orders', work.id, 'UPDATE', actor.id, previous, to_jsonb(work));
  return work.id;
end $$;

revoke all on function public.dmp_schedule_work_order_return_visit(uuid,uuid,date,time,text) from public,anon;
grant execute on function public.dmp_schedule_work_order_return_visit(uuid,uuid,date,time,text) to authenticated;
notify pgrst, 'reload schema';
commit;
