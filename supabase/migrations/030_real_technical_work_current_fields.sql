-- DoorManager Pro - fuente actual unica para trabajo tecnico del parte.
-- Mantiene work_order_notes como historial y usa work_orders como estado actual editable.

begin;

alter table public.work_orders add column if not exists observations text;

create or replace function public.sync_work_order_note(p_work_order_id uuid, p_note text, p_local_change_id text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_id uuid;
  v_note text := trim(coalesce(p_note, ''));
  v_diagnosis text := nullif(trim(substring(v_note from '(?i)Diagn[oó]stico:\s*([^\n]+)')), '');
  v_work_performed text := nullif(trim(substring(v_note from '(?i)Trabajo realizado:\s*([^\n]+)')), '');
  v_observations text := nullif(trim(substring(v_note from '(?i)Observaciones:\s*([^\n]+)')), '');
  v_result text := nullif(trim(coalesce(substring(v_note from '(?i)Resultado:\s*([^\n]+)'), substring(v_note from '(?i)Soluci[oó]n:\s*([^\n]+)'))), '');
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(p_work_order_id, v_profile_id)) then raise exception 'No tienes permisos para sincronizar este parte'; end if;
  if v_note = '' then raise exception 'No hay datos de intervencion para sincronizar'; end if;

  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by, local_change_id)
  values (v_company_id, p_work_order_id, v_note, 'Tecnica', v_profile_id, nullif(p_local_change_id, ''))
  on conflict (company_id, local_change_id) where local_change_id is not null do update set note = excluded.note
  returning id into v_id;

  update public.work_orders
  set diagnosis = coalesce(v_diagnosis, diagnosis),
      work_performed = coalesce(v_work_performed, work_performed),
      result = coalesce(v_result, result),
      observations = coalesce(v_observations, observations),
      updated_by = v_profile_id,
      updated_at = now()
  where id = p_work_order_id and company_id = v_company_id and deleted_at is null;

  return v_id;
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
  v_current_status text;
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'estado editable: el parte esta % y no permite correccion operativa', v_work.status; end if;
  if not (
    public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
    or (public.has_any_role(array['Tecnico']) and public.is_assigned_to_work_order(v_work.id, v_profile.id))
    or (public.has_any_role(array['Comercial']) and public.dmp_commercial_can_manage_work_order(v_work, v_profile))
  ) then
    raise exception 'permiso: rol sin permiso para corregir el trabajo tecnico de este parte';
  end if;

  v_old := to_jsonb(v_work);
  v_current_status := v_work.status;

  update public.work_orders
  set
    description = case when p_payload ? 'description' then nullif(p_payload->>'description', '') else description end,
    diagnosis = case when p_payload ? 'diagnosis' then nullif(p_payload->>'diagnosis', '') else diagnosis end,
    work_performed = case when p_payload ? 'work_performed' then nullif(p_payload->>'work_performed', '') else work_performed end,
    result = case when p_payload ? 'result' then nullif(p_payload->>'result', '') else result end,
    observations = case when p_payload ? 'observations' then nullif(p_payload->>'observations', '') else observations end,
    planned_material = case when p_payload ? 'planned_material' then nullif(p_payload->>'planned_material', '') else planned_material end,
    updated_by = v_profile.id,
    updated_at = now()
  where id = v_work.id and company_id = v_work.company_id and deleted_at is null
  returning * into v_work;

  if p_payload ? 'description' then v_changed := v_changed || jsonb_build_object('description', jsonb_build_object('old', v_old->>'description', 'new', v_work.description)); end if;
  if p_payload ? 'diagnosis' then v_changed := v_changed || jsonb_build_object('diagnosis', jsonb_build_object('old', v_old->>'diagnosis', 'new', v_work.diagnosis)); end if;
  if p_payload ? 'work_performed' then v_changed := v_changed || jsonb_build_object('work_performed', jsonb_build_object('old', v_old->>'work_performed', 'new', v_work.work_performed)); end if;
  if p_payload ? 'result' then v_changed := v_changed || jsonb_build_object('result', jsonb_build_object('old', v_old->>'result', 'new', v_work.result)); end if;
  if p_payload ? 'observations' then v_changed := v_changed || jsonb_build_object('observations', jsonb_build_object('old', v_old->>'observations', 'new', v_work.observations)); end if;
  if p_payload ? 'planned_material' then v_changed := v_changed || jsonb_build_object('planned_material', jsonb_build_object('old', v_old->>'planned_material', 'new', v_work.planned_material)); end if;

  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by)
  values (v_work.company_id, v_work.id, 'Correccion operativa: ' || v_changed::text, 'Interna', v_profile.id);

  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_work.company_id, 'work_orders', v_work.id, 'OPERATIONAL_UPDATE', v_profile.id, v_old, jsonb_build_object('changed_fields', v_changed, 'status', v_current_status, 'updated_at', v_work.updated_at, 'updated_by', v_profile.id));

  return v_work;
end;
$$;

revoke all on function public.sync_work_order_note(uuid, text, text) from public;
revoke all on function public.sync_work_order_note(uuid, text, text) from anon;
grant execute on function public.sync_work_order_note(uuid, text, text) to authenticated;
revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from public;
revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from anon;
grant execute on function public.dmp_update_work_order_operational_fields(uuid, jsonb) to authenticated;

commit;
