-- DoorManager Pro - metadatos transaccionales para sincronizacion de bloques de check

alter table public.check_section_results add column if not exists intervention text;
alter table public.check_section_results add column if not exists severity text check (severity is null or severity in ('Leve','Media','Alta','Critica'));
alter table public.check_section_results add column if not exists components jsonb not null default '[]'::jsonb;
alter table public.check_section_results add column if not exists local_change_id text;
alter table public.check_section_results add column if not exists synced_at timestamptz;

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

grant execute on function public.save_check_block_result(jsonb) to authenticated;
