-- Resolucion operativa de conceptos previstos sin permisos economicos.
begin;

create or replace function public.dmp_resolve_planned_concept_technical(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_line public.quote_lines;
  v_decision text := nullif(p_payload->>'decision', '');
  v_quantity numeric := coalesce(nullif(p_payload->>'actual_quantity', '')::numeric, nullif(p_payload->>'quantity', '')::numeric);
  v_notes text := nullif(p_payload->>'technical_notes', '');
  v_id uuid;
begin
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_profile.primary_area <> 'Tecnico' and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'No tienes permisos para resolver conceptos previstos'; end if;
  if v_decision not in ('confirmado','no_realizado') then raise exception 'Decision tecnica no valida'; end if;
  select * into v_line from public.quote_lines where id = (p_payload->>'quote_line_id')::uuid and company_id = v_work.company_id and deleted_at is null;
  if v_line.id is null or v_work.quote_id is null or v_line.quote_id <> v_work.quote_id then raise exception 'Linea prevista no valida para el parte'; end if;
  if v_line.line_type in ('material','labor','fee','discount') then raise exception 'Este concepto no admite resolucion tecnica'; end if;
  if v_decision = 'confirmado' then
    v_quantity := coalesce(v_quantity, v_line.quantity, 1);
    if v_quantity <= 0 then raise exception 'La cantidad real debe ser mayor que cero'; end if;
  else
    v_quantity := null;
  end if;
  insert into public.work_order_quote_line_decisions(company_id, work_order_id, quote_line_id, decision, work_order_cost_entry_id, real_quantity, real_unit, real_unit_cost, notes, decided_by, decided_at, updated_at, deleted_at)
  values (v_work.company_id, v_work.id, v_line.id, v_decision, null, v_quantity, case when v_decision = 'confirmado' then coalesce(v_line.unit, 'ud') else null end, null, v_notes, v_profile.id, now(), now(), null)
  on conflict (company_id, work_order_id, quote_line_id) do update set decision = excluded.decision, work_order_cost_entry_id = null, real_quantity = excluded.real_quantity, real_unit = excluded.real_unit, real_unit_cost = null, notes = excluded.notes, decided_by = excluded.decided_by, decided_at = now(), updated_at = now(), deleted_at = null
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.dmp_resolve_planned_concept_technical(jsonb) from public, anon;
grant execute on function public.dmp_resolve_planned_concept_technical(jsonb) to authenticated;

commit;
