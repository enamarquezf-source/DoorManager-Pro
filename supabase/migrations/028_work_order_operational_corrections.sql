-- DoorManager Pro - correccion operativa auditada de partes por roles autorizados.
-- No relaja RLS global: usa RPC con usuario activo, company_id y parte asignado.

begin;

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

  if p_payload ? 'description' then v_changed := v_changed || jsonb_build_object('description', jsonb_build_object('old', v_old->>'description', 'new', v_work.description)); end if;
  if p_payload ? 'diagnosis' then v_changed := v_changed || jsonb_build_object('diagnosis', jsonb_build_object('old', v_old->>'diagnosis', 'new', v_work.diagnosis)); end if;
  if p_payload ? 'work_performed' then v_changed := v_changed || jsonb_build_object('work_performed', jsonb_build_object('old', v_old->>'work_performed', 'new', v_work.work_performed)); end if;
  if p_payload ? 'result' then v_changed := v_changed || jsonb_build_object('result', jsonb_build_object('old', v_old->>'result', 'new', v_work.result)); end if;
  if p_payload ? 'planned_material' then v_changed := v_changed || jsonb_build_object('planned_material', jsonb_build_object('old', v_old->>'planned_material', 'new', v_work.planned_material)); end if;

  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_work.company_id, 'work_orders', v_work.id, 'OPERATIONAL_UPDATE', v_profile.id, v_old, jsonb_build_object('changed_fields', v_changed, 'updated_at', v_work.updated_at, 'updated_by', v_profile.id));

  return v_work;
end;
$$;

revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from public;
revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from anon;
grant execute on function public.dmp_update_work_order_operational_fields(uuid, jsonb) to authenticated;

commit;
