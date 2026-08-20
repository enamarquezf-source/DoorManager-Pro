-- DoorManager Pro - fix 058: coste real (unit_cost) de los materiales consumidos en partes.
-- Idempotente. Mantiene RLS y company_id. Sin borrados destructivos y sin service_role.
-- Redefine SOLO public.dmp_work_order_material_set_totals_trigger y
-- public.dmp_upsert_work_order_material partiendo EXACTAMENTE de las versiones efectivas
-- de 039 (trigger) y 035 (RPC), que YA estan aplicadas en Supabase y NO se modifican.
-- No toca 001-057, no amplia alcance, no modifica stock (035/052) ni tarifas.

-- CAUSA del P0 (real_cost_amount infravalorado, margen inflado):
--   035:153 y 035:161 calculan unit_price (precio de VENTA) y el INSERT 035:162-163
--   NUNCA escribe unit_cost (columna NOT NULL DEFAULT 0 desde 039). El trigger 039:78
--   hace new.unit_cost := coalesce(new.unit_cost, new.unit_price, 0) pero el DEFAULT 0
--   ya se aplica ANTES de los BEFORE triggers, asi que unit_cost llega como 0 (no NULL)
--   y el coalesce se resuelve a 0. Resultado: unit_cost = 0, total_cost = 0.
--   Ademas, para el rol tecnico unit_price tambien vale 0 (el flujo no aporta venta
--   explicita), por lo que ni siquiera hay precio de venta en la fila para material de
--   catalogo; esa venta SI esta en material_stock_movements.unit_cost (035:155/166 usa
--   coalesce(v_material_row.cost, v_unit_price) al descontar) y en el catalogo materials.cost.
--   Excepcion: 039:36-48 backfilleo unit_cost desde materials.cost SOLO para las filas
--   existentes al aplicar 039; todo alta posterior por 035 queda con unit_cost = 0.

-- CORRECCION (snapshot server-side, sin fiarse del navegador del tecnico):
--   INSERT (material de catalogo): unit_cost  <- materials.cost (nunca materials.price)
--                                   unit_price <- materials.price (o override admin explicito)
--   INSERT (material manual):       unit_cost  = 0 (no hay catalogo); unit_price segun contrato
--   UPDATE: conserva el snapshot de la fila salvo override admin explicito en el payload;
--           cambiar SOLO cantidad/notas no refresca el snapshot desde el catalogo.
--           Cambiar material_id SI captura el snapshot del nuevo catalogo (nueva referencia).
--   El coste se resuelve SIEMPRE en el servidor; los tecnicos no envian coste.
--   materials.price JAMAS se usa como unit_cost. COSTE REAL = unit_cost, VENTA = unit_price.
--   El trigger 058 recalcula totales SIN consultar catalogo y SIN reinterpretar 0.
--   Stock 035/052 intacto: descuento/devolucion/stock_deducted_quantity/material_stock_movements.

-- BACKFILL CONSERVADOR de historico: solo filas con material de catalogo, uso real y
-- unit_cost = 0 que tengan traza fiable en material_stock_movements (salida 'out' fuente
-- 'work_order' con unit_cost > 0). NO usa materials.price como coste. NO inventa datos
-- historicos. Filas sin traza fiable quedan SIN tocar (ambiguas) y se listan al final.
-- Tras reparar, sincroniza real_cost_amount y margen de las partes afectadas con la vista
-- economica (garantia / no facturable -> margen 0, misma semantica que 053).

begin;

-- ============================================================
-- 1) Trigger de totales de material: respeta unit_cost/unit_price establecidos,
--    calcula totales y NO consulta el catalogo ni reinterpreta 0 como unit_price.
-- ============================================================
create or replace function public.dmp_work_order_material_set_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.unit_cost := coalesce(new.unit_cost, 0);
  new.unit_price := coalesce(new.unit_price, 0);
  new.total_cost := round(coalesce(new.used_quantity, 0) * new.unit_cost, 2);
  new.total_price := round(coalesce(new.used_quantity, 0) * new.unit_price, 2);
  return new;
end;
$$;

drop trigger if exists work_order_material_set_totals_trigger on public.work_order_materials;
create trigger work_order_material_set_totals_trigger before insert or update on public.work_order_materials for each row execute function public.dmp_work_order_material_set_totals_trigger();

-- ============================================================
-- 2) RPC de alta/edicion de material usado en parte (redefine 035, misma firma).
-- ============================================================
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
  v_previous public.work_order_materials;
  v_unit_cost numeric := 0;
  v_unit_price numeric := 0;
  v_stock_deducted numeric := 0;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia']);
  v_requested_cost numeric := nullif(p_payload->>'unit_cost', '')::numeric;
  v_requested_price numeric := nullif(p_payload->>'unit_price', '')::numeric;
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if trim(coalesce(p_payload->>'unit', 'ud')) = '' then raise exception 'validacion del formulario: indica una unidad'; end if;
  if v_material is not null then
    select * into v_material_row from public.materials where id = v_material and deleted_at is null for update;
    if v_material_row.id is null or (v_material_row.company_id is not null and v_material_row.company_id <> v_work.company_id) then raise exception 'empresa: material no valido para la empresa del parte'; end if;
  end if;
  if v_material is null and trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'validacion del formulario: indica material de catalogo o descripcion no catalogada'; end if;
  if v_local is not null then
    if exists (select 1 from public.work_order_materials where company_id = v_work.company_id and local_change_id = v_local and work_order_id <> v_work.id) then raise exception 'insercion: el identificador local ya pertenece a otro parte'; end if;
    select id into v_id from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local and deleted_at is null;
  end if;
  if v_id is not null then
    select * into v_previous from public.work_order_materials where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null for update;
    if v_previous.id is null or not (v_previous.registered_by = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia'])) then raise exception 'permiso: material no editable para este usuario'; end if;
    if v_previous.material_id is not null and v_previous.stock_deducted_quantity > 0 then
      perform public.dmp_apply_material_stock_movement(v_previous.material_id, 'return', v_previous.stock_deducted_quantity, 'Correccion de material de parte', 'correction', v_work.id, v_previous.id, null, v_previous.unit_price, v_profile.id);
    end if;
    if v_material is not null and v_previous.material_id is distinct from v_material then
      v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material_row.cost, 0) end;
      v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else coalesce(v_material_row.price, 0) end;
    else
      v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else v_previous.unit_cost end;
      v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else v_previous.unit_price end;
    end if;
    if v_material is not null and coalesce(v_material_row.stock_controlled, true) then
      perform public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity, 'Consumo en parte ' || v_work.code, 'work_order', v_work.id, v_id, null, v_unit_cost, v_profile.id);
      v_stock_deducted := v_quantity;
    end if;
    update public.work_order_materials set material_id = v_material, description = nullif(p_payload->>'description', ''), used_quantity = v_quantity, unit = coalesce(nullif(p_payload->>'unit', ''), unit, v_material_row.unit, 'ud'), unit_cost = v_unit_cost, unit_price = v_unit_price, total_cost = round(v_quantity * v_unit_cost, 2), total_price = round(v_quantity * v_unit_price, 2), notes = nullif(p_payload->>'notes', ''), registered_by = coalesce(registered_by, v_profile.id), used_at = coalesce(nullif(p_payload->>'used_at', '')::date, used_at, current_date), stock_deducted_quantity = v_stock_deducted, updated_at = now() where id = v_id;
    return v_id;
  end if;
  if v_material is not null then
    v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material_row.cost, 0) end;
    v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else coalesce(v_material_row.price, 0) end;
  else
    v_unit_cost := 0;
    v_unit_price := case when v_admin then coalesce(v_requested_price, 0) else 0 end;
  end if;
  insert into public.work_order_materials(company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit, unit_cost, unit_price, notes, registered_by, used_at, local_change_id, stock_deducted_quantity)
  values (v_work.company_id, v_work.id, v_material, nullif(p_payload->>'description', ''), 0, v_quantity, coalesce(nullif(p_payload->>'unit', ''), v_material_row.unit, 'ud'), v_unit_cost, v_unit_price, nullif(p_payload->>'notes', ''), v_profile.id, coalesce(nullif(p_payload->>'used_at', '')::date, current_date), v_local, 0)
  returning id into v_id;
  if v_material is not null and coalesce(v_material_row.stock_controlled, true) then
    perform public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity, 'Consumo en parte ' || v_work.code, 'work_order', v_work.id, v_id, null, v_unit_cost, v_profile.id);
    update public.work_order_materials set stock_deducted_quantity = v_quantity where id = v_id;
  end if;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

revoke all on function public.dmp_upsert_work_order_material(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_material(jsonb) from anon;
grant execute on function public.dmp_upsert_work_order_material(jsonb) to authenticated;

-- ============================================================
-- 3) BACKFILL CONSERVADOR de consumos historicos con unit_cost = 0.
--    Fuente de reparacion: SOLO material_stock_movements (salida 'out' / fuente
--    'work_order' con unit_cost > 0, el mas reciente por fila). Nunca materials.price.
--    Ambiguas (sin traza fiable o coste legitimo 0) se dejan intactas y se cuentan.
--    Tras reparar, sincroniza real_cost_amount / margen de las partes afectadas con
--    v_work_order_economic_summary (040) para que el panel refleje el coste real.
-- ============================================================
do $$
declare
  v_repaired integer := 0;
  v_affected_work_orders integer := 0;
  v_ambiguous integer := 0;
begin
  create temp table dmp_058_repaired on commit drop as
  with candidates as (
    select wom.id as material_usage_id,
           wom.work_order_id,
           wom.used_quantity,
           wom.unit_price,
           msm.unit_cost as historical_unit_cost
    from public.work_order_materials wom
    left join lateral (
      select m.unit_cost, m.created_at, m.id
      from public.material_stock_movements m
      where m.work_order_material_id = wom.id
        and m.movement_type = 'out'
        and m.source = 'work_order'
        and coalesce(m.unit_cost, 0) > 0
      order by m.created_at desc, m.id desc
      limit 1
    ) msm on true
    where wom.deleted_at is null
      and wom.material_id is not null
      and wom.used_quantity > 0
      and coalesce(wom.unit_cost, 0) = 0
  )
  select material_usage_id, work_order_id, used_quantity, unit_price, historical_unit_cost
  from candidates
  where historical_unit_cost is not null;

  update public.work_order_materials wom
  set unit_cost = r.historical_unit_cost,
      total_cost = round(r.used_quantity * r.historical_unit_cost, 2),
      total_price = round(r.used_quantity * r.unit_price, 2),
      updated_at = now()
  from dmp_058_repaired r
  where wom.id = r.material_usage_id;
  get diagnostics v_repaired = row_count;

  update public.work_orders wo
  set real_cost_amount = v.real_cost_amount,
      estimated_margin_amount = case
        when wo.warranty or wo.billable = false or wo.economic_status in ('garantia','no_facturable') then 0
        else round(v.sale_amount - v.real_cost_amount, 2)
      end,
      updated_at = now()
  from public.v_work_order_economic_summary v
  where wo.id = v.id
    and wo.deleted_at is null
    and wo.id in (select distinct work_order_id from dmp_058_repaired);
  get diagnostics v_affected_work_orders = row_count;

  select count(*) into v_ambiguous
  from public.work_order_materials wom
  where wom.deleted_at is null
    and wom.material_id is not null
    and wom.used_quantity > 0
    and coalesce(wom.unit_cost, 0) = 0
    and not exists (
      select 1 from public.material_stock_movements m
      where m.work_order_material_id = wom.id
        and m.movement_type = 'out'
        and m.source = 'work_order'
        and coalesce(m.unit_cost, 0) > 0
    );

  raise notice 'dmp_058: work_order_materials reparados=% ; partes afectados=% ; filas ambiguas sin reparar=%', v_repaired, v_affected_work_orders, v_ambiguous;
end $$;

-- ============================================================
-- Verificacion READ-ONLY posterior (ejecutar en el SQL Editor, fuera de Codex):
--   select wom.id, wom.material_id, wom.used_quantity, wom.unit_cost, wom.unit_price,
--          wom.total_cost, msm.unit_cost as coste_historico_movimiento
--   from work_order_materials wom
--   left join lateral (select m.unit_cost from material_stock_movements m
--     where m.work_order_material_id = wom.id and m.movement_type = 'out' and m.source = 'work_order'
--     order by m.created_at desc, m.id desc limit 1) msm on true
--   where wom.work_order_id = (select id from work_orders where code = 'PAR-2026-000008')
--     and wom.deleted_at is null;
--
--   select woe.id, woe.code, woe.material_cost, woe.time_cost, woe.auxiliary_cost,
--          woe.real_cost_amount, woe.sale_amount, woe.margin_amount
--   from v_work_order_economic_summary woe
--   where woe.code = 'PAR-2026-000008';
-- ============================================================

commit;