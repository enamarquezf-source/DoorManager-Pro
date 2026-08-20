-- DoorManager Pro - prevencion de doble contabilizacion de recursos/costes de partes (P1).
-- Idempotente. Preventivo: los diagnosticos en produccion devolvieron 0 duplicados.
-- Anade trazabilidad explicita de origen (source) a work_order_cost_entries:
--   quote      -> concepto previsto confirmado desde presupuesto (quote_line_id not null)
--   manual     -> registro manual sin relacion con presupuesto
--   additional -> registro manual declarado como coste adicional al presupuestado
-- El nombre 'source' es coherente con material_stock_movements.source (035/052).
-- Backfill ESTRUCTURAL (no economico): deriva el origen de las filas existentes.
-- NO toca unit_cost/unit_price/total_cost/total_price, ni vistas economicas (040),
-- ni materiales/stock (035/052/058), ni tarifas de horas (042), ni RLS.
-- La RPC de alta manual rechaza registrar en silencio un tipo ya contabilizado desde
-- presupuesto: exige additional_to_planned=true para costes adicionales reales.
-- El origen queda persistido y no dependera en el futuro solo de quote_line_id.

begin;

-- ============================================================
-- 1) Columna de origen explicita + check
-- ============================================================
alter table public.work_order_cost_entries add column if not exists source text not null default 'manual';

alter table public.work_order_cost_entries drop constraint if exists work_order_cost_entries_source_check;
alter table public.work_order_cost_entries add constraint work_order_cost_entries_source_check
  check (source in ('quote','manual','additional'));

-- ============================================================
-- 2) Backfill estructural conservador (NO economico): deriva el origen.
--    quote_line_id not null -> 'quote'; el resto -> 'manual'.
--    Idempotente y seguro: solo corrige filas incoherentes (no machaca 'additional').
-- ============================================================
update public.work_order_cost_entries
set source = case when quote_line_id is not null then 'quote' else 'manual' end
where (quote_line_id is not null and source is distinct from 'quote')
   or (quote_line_id is null and source is null);

-- ============================================================
-- 3) dmp_set_work_order_quote_line_decision (version efectiva 047) + source='quote'.
--    Las entradas creadas desde un concepto previsto SIEMPRE quedan con origen 'quote'.
-- ============================================================
create or replace function public.dmp_set_work_order_quote_line_decision(p_payload jsonb)
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
  v_cost_type text;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'real_quantity', '')::numeric);
  v_unit text := nullif(p_payload->>'unit', '');
  v_unit_cost numeric := nullif(p_payload->>'unit_cost', '')::numeric;
  v_cost_entry_id uuid;
  v_decision_id uuid;
  v_notes text := nullif(p_payload->>'notes', '');
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  if nullif(p_payload->>'quote_line_id', '') is null then raise exception 'validacion del formulario: falta quote_line_id'; end if;
  if v_decision not in ('confirmado','no_realizado') then raise exception 'validacion del formulario: decision de concepto previsto no valida'; end if;

  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  select * into v_line from public.quote_lines where id = (p_payload->>'quote_line_id')::uuid and company_id = v_work.company_id and deleted_at is null;
  if v_line.id is null then raise exception 'presupuesto: linea prevista no encontrada'; end if;
  if v_work.quote_id is null or v_line.quote_id <> v_work.quote_id then raise exception 'presupuesto: linea prevista no pertenece al presupuesto del parte'; end if;
  if v_line.line_type in ('material','labor','fee','discount') then raise exception 'concepto previsto: este tipo no se convierte en coste operativo real'; end if;
  v_cost_type := public.dmp_quote_line_cost_type(v_line.line_type);
  if v_cost_type is null then raise exception 'concepto previsto: tipo no operativo'; end if;

  v_quantity := coalesce(v_quantity, v_line.quantity, 1);
  v_unit := coalesce(v_unit, v_line.unit, 'ud');
  v_unit_cost := coalesce(v_unit_cost, v_line.unit_cost, 0);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if v_unit_cost < 0 then raise exception 'validacion del formulario: el coste unitario no puede ser negativo'; end if;
  if v_unit_cost > 0 and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permisos para registrar importes economicos'; end if;

  if v_decision = 'confirmado' then
    select id into v_cost_entry_id
    from public.work_order_cost_entries
    where company_id = v_work.company_id and work_order_id = v_work.id and quote_line_id = v_line.id and deleted_at is null
    for update;

    if v_cost_entry_id is null then
      insert into public.work_order_cost_entries(company_id, work_order_id, quote_line_id, cost_type, description, quantity, unit, unit_cost, incurred_at, registered_by, updated_by, local_change_id, source)
      values (v_work.company_id, v_work.id, v_line.id, v_cost_type, v_line.description, v_quantity, v_unit, case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else 0 end, current_date, v_profile.id, v_profile.id, 'quote-line:' || v_line.id::text, 'quote')
      on conflict (company_id, work_order_id, quote_line_id) where quote_line_id is not null and deleted_at is null do update
        set cost_type = excluded.cost_type,
            description = excluded.description,
            quantity = excluded.quantity,
            unit = excluded.unit,
            unit_cost = excluded.unit_cost,
            source = excluded.source,
            updated_at = now(),
            updated_by = excluded.updated_by,
            local_change_id = excluded.local_change_id
      returning id into v_cost_entry_id;
    else
      update public.work_order_cost_entries
      set cost_type = v_cost_type,
          description = v_line.description,
          quantity = v_quantity,
          unit = v_unit,
          unit_cost = case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else unit_cost end,
          source = 'quote',
          updated_at = now(),
          updated_by = v_profile.id,
          local_change_id = coalesce(local_change_id, 'quote-line:' || v_line.id::text)
      where id = v_cost_entry_id;
    end if;
  else
    update public.work_order_cost_entries
    set deleted_at = now(), deleted_by = v_profile.id, delete_reason = coalesce(v_notes, 'Concepto previsto marcado como no realizado'), updated_at = now(), updated_by = v_profile.id
    where company_id = v_work.company_id and work_order_id = v_work.id and quote_line_id = v_line.id and deleted_at is null;
    v_cost_entry_id := null;
  end if;

  insert into public.work_order_quote_line_decisions(company_id, work_order_id, quote_line_id, decision, work_order_cost_entry_id, real_quantity, real_unit, real_unit_cost, notes, decided_by, decided_at, updated_at, deleted_at)
  values (v_work.company_id, v_work.id, v_line.id, v_decision, v_cost_entry_id, case when v_decision = 'confirmado' then v_quantity else null end, case when v_decision = 'confirmado' then v_unit else null end, case when v_decision = 'confirmado' then v_unit_cost else null end, v_notes, v_profile.id, now(), now(), null)
  on conflict (company_id, work_order_id, quote_line_id) do update
    set decision = excluded.decision,
        work_order_cost_entry_id = excluded.work_order_cost_entry_id,
        real_quantity = excluded.real_quantity,
        real_unit = excluded.real_unit,
        real_unit_cost = excluded.real_unit_cost,
        notes = excluded.notes,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now(),
        deleted_at = null
  returning id into v_decision_id;

  return coalesce(v_cost_entry_id, v_decision_id);
end;
$$;

revoke all on function public.dmp_set_work_order_quote_line_decision(jsonb) from public;
revoke all on function public.dmp_set_work_order_quote_line_decision(jsonb) from anon;
grant execute on function public.dmp_set_work_order_quote_line_decision(jsonb) to authenticated;

-- ============================================================
-- 4) dmp_upsert_work_order_cost_entry (version efectiva 027) + proteccion P1.
--    INSERT manual:
--      - sin conflicto                      -> source 'manual'
--      - existe concepto previsto activo del mismo cost_type sin confirmacion -> rechaza
--      - existe y el cliente confirma (additional_to_planned=true) -> source 'additional'
--    UPDATE: sin comprobacion nueva; conserva el source existente.
-- ============================================================
create or replace function public.dmp_upsert_work_order_cost_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_cost_type text := coalesce(nullif(p_payload->>'cost_type', ''), 'otro');
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 1);
  v_unit_cost numeric := coalesce(nullif(p_payload->>'unit_cost', '')::numeric, 0);
  v_additional boolean := coalesce((p_payload->>'additional_to_planned')::boolean, false);
begin
  v_work := public.dmp_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_cost_type not in ('desplazamiento','taller_movil','plataforma_elevadora','medio_auxiliar','coste_externo','parking_peaje','dieta','otro') then raise exception 'Tipo de recurso o coste no valido'; end if;
  if trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'La descripcion del recurso o coste es obligatoria'; end if;
  if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if v_unit_cost < 0 then raise exception 'El coste unitario no puede ser negativo'; end if;
  if v_unit_cost > 0 and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'No tienes permisos para registrar importes economicos'; end if;
  if v_local is not null then
    if exists (select 1 from public.work_order_cost_entries where company_id = v_work.company_id and local_change_id = v_local and work_order_id <> v_work.id and deleted_at is null) then raise exception 'El identificador local ya pertenece a otro parte'; end if;
    select id into v_id from public.work_order_cost_entries where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local and deleted_at is null;
  end if;
  if v_id is not null then
    if not exists (select 1 from public.work_order_cost_entries where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null and (registered_by = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))) then raise exception 'Recurso o coste no editable'; end if;
    update public.work_order_cost_entries set cost_type = v_cost_type, description = trim(p_payload->>'description'), quantity = v_quantity, unit = coalesce(nullif(p_payload->>'unit', ''), unit, 'ud'), unit_cost = case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else unit_cost end, incurred_at = coalesce(nullif(p_payload->>'incurred_at', '')::date, incurred_at, current_date), updated_at = now(), updated_by = v_profile.id where id = v_id;
    return v_id;
  end if;
  if not v_additional and exists (
    select 1 from public.work_order_cost_entries
    where company_id = v_work.company_id
      and work_order_id = v_work.id
      and cost_type = v_cost_type
      and quote_line_id is not null
      and deleted_at is null
  ) then
    raise exception 'adicional: este parte ya tiene un concepto de tipo % procedente del presupuesto contabilizado; si este registro es un coste adicional real, confirma que es adicional (additional_to_planned=true)', v_cost_type;
  end if;
  insert into public.work_order_cost_entries(company_id, work_order_id, cost_type, description, quantity, unit, unit_cost, incurred_at, registered_by, updated_by, local_change_id, source)
  values (v_work.company_id, v_work.id, v_cost_type, trim(p_payload->>'description'), v_quantity, coalesce(nullif(p_payload->>'unit', ''), 'ud'), case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else 0 end, coalesce(nullif(p_payload->>'incurred_at', '')::date, current_date), v_profile.id, v_profile.id, v_local, case when v_additional then 'additional' else 'manual' end)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.dmp_upsert_work_order_cost_entry(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_cost_entry(jsonb) from anon;
grant execute on function public.dmp_upsert_work_order_cost_entry(jsonb) to authenticated;

commit;