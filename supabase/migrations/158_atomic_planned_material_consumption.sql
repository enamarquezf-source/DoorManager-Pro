-- Atomic, serialized confirmation of budget materials. Manual repeated consumptions remain allowed.
begin;

create or replace function public.dmp_submit_work_order_material(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_material public.materials;
  v_quote_line public.quote_lines;
  v_usage public.work_order_materials;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_material_id uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_quote_line_id uuid := nullif(p_payload->>'quote_line_id', '')::uuid;
  v_warehouse_id uuid := nullif(p_payload->>'warehouse_id', '')::uuid;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 1);
  v_unit_cost numeric := 0;
  v_unit_price numeric := 0;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
  v_requested_cost numeric := nullif(p_payload->>'unit_cost', '')::numeric;
  v_requested_price numeric := nullif(p_payload->>'unit_price', '')::numeric;
begin
  if nullif(p_payload->>'work_order_id', '') is null then
    raise exception 'validacion del formulario: falta work_order_id';
  end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  -- Serialize submissions for this part before checking the planned-line decision.
  perform 1 from public.work_orders where id = v_work.id and company_id = v_work.company_id for update;
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if v_material_id is null and trim(coalesce(p_payload->>'description', '')) = '' then
    raise exception 'validacion del formulario: indica material de catalogo o descripcion no catalogada';
  end if;

  if v_quote_line_id is not null then
    select ql.* into v_quote_line
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id and q.company_id = v_work.company_id and q.deleted_at is null
    where ql.id = v_quote_line_id and ql.company_id = v_work.company_id and ql.deleted_at is null;
    if v_quote_line.id is null or v_work.quote_id is null or v_quote_line.quote_id <> v_work.quote_id then
      raise exception 'presupuesto: linea de material no pertenece al presupuesto del parte';
    end if;
    if v_quote_line.material_id is distinct from v_material_id then
      raise exception 'presupuesto: el material no coincide con la linea prevista';
    end if;
    v_unit_cost := coalesce(v_quote_line.unit_cost, 0);
    v_unit_price := coalesce(v_quote_line.unit_price, 0);
  end if;

  if v_quote_line_id is not null then
    select u.* into v_usage
    from public.work_order_planned_material_decisions d
    join public.work_order_materials u on u.id = d.work_order_material_id
      and u.company_id = d.company_id and u.work_order_id = d.work_order_id and u.deleted_at is null
    where d.company_id = v_work.company_id and d.work_order_id = v_work.id
      and d.quote_line_id = v_quote_line_id and d.deleted_at is null
    for update of u;
    if v_usage.id is not null then
      if v_id is not null and v_id <> v_usage.id then
        raise exception 'material: la linea prevista ya esta vinculada a otro consumo';
      end if;
      if v_usage.material_id is distinct from v_material_id then
        raise exception 'material: el consumo existente no coincide con la linea prevista';
      end if;
      if v_usage.stock_validation_status = 'validated' then
        if v_usage.used_quantity = v_quantity and v_usage.stock_warehouse_id is not distinct from v_warehouse_id then
          return v_usage.id;
        end if;
        raise exception 'stock: el material previsto ya tiene un consumo validado; revisa el registro existente';
      end if;
      v_id := v_usage.id;
    end if;
  end if;

  if v_material_id is not null then
    select * into v_material from public.materials where id = v_material_id and deleted_at is null for update;
    if v_material.id is null or v_material.company_id <> v_work.company_id then raise exception 'empresa: material no valido para la empresa del parte'; end if;
    if coalesce(v_material.stock_controlled, true) then
      if v_warehouse_id is null then raise exception 'stock: indica el almacen de origen para validar el consumo'; end if;
      if not exists (select 1 from public.warehouses where id = v_warehouse_id and company_id = v_work.company_id and active and deleted_at is null) then
        raise exception 'stock: almacen no valido para la empresa';
      end if;
      if not exists (select 1 from public.warehouse_stock where warehouse_id = v_warehouse_id and material_id = v_material_id) then
        raise exception 'stock: el material no tiene apertura en el almacen indicado';
      end if;
    end if;
    if v_quote_line_id is null then
      v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material.cost, 0) end;
      v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else coalesce(v_material.price, 0) end;
    end if;
  end if;

  if v_local is not null then
    select * into v_usage from public.work_order_materials
    where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local and deleted_at is null
    for update;
    if v_usage.id is not null then return v_usage.id; end if;
  end if;
  if v_id is not null then
    select * into v_usage from public.work_order_materials
    where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null
    for update;
    if v_usage.id is null then raise exception 'material: material no encontrado'; end if;
    if v_usage.stock_validation_status <> 'pending' then raise exception 'stock: el consumo validado es historico y no admite edicion'; end if;
    if v_usage.registered_by <> v_profile.id and not v_admin then raise exception 'permiso: material no editable para este usuario'; end if;
  end if;

  if v_usage.id is null then
    insert into public.work_order_materials(
      company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit,
      unit_cost, unit_price, notes, registered_by, used_at, local_change_id, stock_deducted_quantity,
      stock_validation_status, stock_warehouse_id
    ) values (
      v_work.company_id, v_work.id, v_material_id, nullif(p_payload->>'description', ''), 0, v_quantity,
      coalesce(nullif(p_payload->>'unit', ''), v_material.unit, 'ud'), v_unit_cost, v_unit_price,
      nullif(p_payload->>'notes', ''), v_profile.id,
      coalesce(nullif(p_payload->>'used_at', '')::date, current_date), v_local, 0,
      case when v_material_id is not null and coalesce(v_material.stock_controlled, true) then 'pending' else 'validated' end,
      case when v_material_id is not null and coalesce(v_material.stock_controlled, true) then v_warehouse_id else null end
    ) returning * into v_usage;
  else
    update public.work_order_materials set
      material_id = v_material_id, description = nullif(p_payload->>'description', ''), used_quantity = v_quantity,
      unit = coalesce(nullif(p_payload->>'unit', ''), unit, v_material.unit, 'ud'), notes = nullif(p_payload->>'notes', ''),
      used_at = coalesce(nullif(p_payload->>'used_at', '')::date, used_at, current_date),
      stock_warehouse_id = v_warehouse_id, updated_at = now()
    where id = v_usage.id returning * into v_usage;
  end if;
  if v_quote_line_id is not null then
    perform public.dmp_set_work_order_planned_material_decision(jsonb_build_object(
      'work_order_id', v_work.id, 'quote_line_id', v_quote_line_id,
      'decision', 'utilizado', 'work_order_material_id', v_usage.id,
      'quantity', v_quantity, 'unit', v_usage.unit, 'notes', p_payload->>'notes'
    ));
  end if;
  return v_usage.id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

revoke all on function public.dmp_submit_work_order_material(jsonb) from public, anon;
grant execute on function public.dmp_submit_work_order_material(jsonb) to authenticated;

create or replace function public.dmp_set_work_order_planned_material_decision(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_quote_line public.quote_lines;
  v_material_usage public.work_order_materials;
  v_decision text := nullif(p_payload->>'decision', '');
  v_id uuid;
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  if nullif(p_payload->>'quote_line_id', '') is null then raise exception 'validacion del formulario: falta quote_line_id'; end if;
  if v_decision not in ('utilizado','no_utilizado') then raise exception 'validacion del formulario: decision de material previsto no valida'; end if;

  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  perform 1 from public.work_orders where id = v_work.id and company_id = v_work.company_id for update;
  select * into v_quote_line from public.quote_lines where id = (p_payload->>'quote_line_id')::uuid and company_id = v_work.company_id and deleted_at is null;
  if v_quote_line.id is null then raise exception 'presupuesto: linea prevista no encontrada'; end if;
  if v_work.quote_id is null or not exists (select 1 from public.quotes q where q.id = v_work.quote_id and q.company_id = v_work.company_id and q.id = v_quote_line.quote_id and q.deleted_at is null) then
    raise exception 'presupuesto: linea prevista no pertenece al presupuesto del parte';
  end if;

  if nullif(p_payload->>'work_order_material_id', '') is not null then
    select * into v_material_usage from public.work_order_materials where id = (p_payload->>'work_order_material_id')::uuid and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;
    if v_material_usage.id is null then raise exception 'material: material utilizado no pertenece al parte'; end if;
  end if;
  if v_decision = 'utilizado' and v_material_usage.id is null then raise exception 'validacion del formulario: falta material utilizado confirmado'; end if;

  if exists (
    select 1 from public.work_order_planned_material_decisions d
    join public.work_order_materials u on u.id = d.work_order_material_id
      and u.company_id = d.company_id and u.work_order_id = d.work_order_id and u.deleted_at is null
    where d.company_id = v_work.company_id and d.work_order_id = v_work.id
      and d.quote_line_id = v_quote_line.id and d.deleted_at is null
      and (v_decision = 'no_utilizado' or u.id is distinct from v_material_usage.id)
  ) then
    raise exception 'material: anula primero el consumo existente antes de cambiar la decision prevista';
  end if;
  if v_material_usage.id is not null and v_material_usage.material_id is distinct from v_quote_line.material_id then
    raise exception 'material: el consumo no coincide con el material previsto';
  end if;

  insert into public.work_order_planned_material_decisions(company_id, work_order_id, quote_line_id, decision, work_order_material_id, quantity, unit, notes, decided_by, decided_at, updated_at, deleted_at)
  values (v_work.company_id, v_work.id, v_quote_line.id, v_decision, v_material_usage.id, nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'unit', ''), nullif(p_payload->>'notes', ''), v_profile.id, now(), now(), null)
  on conflict (company_id, work_order_id, quote_line_id) do update
    set decision = excluded.decision,
        work_order_material_id = excluded.work_order_material_id,
        quantity = excluded.quantity,
        unit = excluded.unit,
        notes = excluded.notes,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now(),
        deleted_at = null
  returning id into v_id;

  return v_id;
end;
$$;


commit;
