-- DoorManager Pro - controlled, atomic bulk initial stock opening.
-- Legacy quantities are proposals only; the operator confirms every item.
begin;

create or replace function public.dmp_set_initial_warehouse_stock_batch(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_warehouse public.warehouses;
  v_material public.materials;
  v_item record;
  v_first_movement uuid;
  v_batch_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_source text := coalesce(nullif(trim(p_payload->>'source'), ''), 'initial_inventory');
  v_reason text := nullif(trim(p_payload->>'reason'), '');
  v_warehouse_id uuid := nullif(p_payload->>'warehouse_id', '')::uuid;
  v_items jsonb := p_payload->'items';
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then
    raise exception 'permiso: solo SAT, Oficina, Gerencia o superadmin puede abrir stock inicial';
  end if;
  if v_batch_key is null then raise exception 'validacion del formulario: falta idempotency_key'; end if;
  if v_reason is null then raise exception 'validacion del formulario: el motivo de apertura es obligatorio'; end if;
  if v_warehouse_id is null then raise exception 'validacion del formulario: falta almacen destino'; end if;
  if coalesce(jsonb_typeof(v_items), '') <> 'array' or coalesce(jsonb_array_length(v_items), 0) = 0 then
    raise exception 'validacion del formulario: selecciona al menos un material';
  end if;
  if exists (
    select item.material_id
    from jsonb_to_recordset(v_items) as item(material_id uuid, quantity numeric)
    group by item.material_id
    having count(*) > 1
  ) then raise exception 'validacion del formulario: no se puede repetir un material en el lote'; end if;

  select * into v_warehouse
  from public.warehouses
  where id = v_warehouse_id and company_id = public.current_company_id() and active and deleted_at is null;
  if v_warehouse.id is null then raise exception 'stock: almacen no valido para la empresa'; end if;

  -- Serialize retries and concurrent submissions for the same company/batch key.
  perform pg_advisory_xact_lock(hashtextextended(public.current_company_id()::text || ':' || v_batch_key, 0));
  select id into v_first_movement
  from public.stock_movements
  where company_id = v_warehouse.company_id and idempotency_key like 'initial-batch:' || v_batch_key || ':%'
  order by created_at
  limit 1;
  if v_first_movement is not null then
    if (select count(*) from public.stock_movements where company_id = v_warehouse.company_id and idempotency_key like 'initial-batch:' || v_batch_key || ':%') <> jsonb_array_length(v_items)
       or exists (
         select 1 from jsonb_to_recordset(v_items) as item(material_id uuid, quantity numeric)
         where not exists (
           select 1 from public.stock_movements sm
           where sm.company_id = v_warehouse.company_id and sm.warehouse_id = v_warehouse.id
             and sm.material_id = item.material_id and sm.quantity = item.quantity
             and sm.idempotency_key = 'initial-batch:' || v_batch_key || ':' || item.material_id
         )
       ) then raise exception 'conflicto: la clave idempotente ya se uso con otro lote';
    end if;
    return v_first_movement;
  end if;

  for v_item in select item.material_id, item.quantity from jsonb_to_recordset(v_items) as item(material_id uuid, quantity numeric) loop
    if v_item.material_id is null then raise exception 'validacion del formulario: falta material en el lote'; end if;
    if v_item.quantity is null or v_item.quantity <= 0 then raise exception 'validacion del formulario: la cantidad de apertura debe ser mayor que cero'; end if;
    select * into v_material
    from public.materials
    where id = v_item.material_id and company_id = v_warehouse.company_id and deleted_at is null
    for update;
    if v_material.id is null then raise exception 'material: material no valido para la empresa'; end if;
    select id into v_first_movement
    from public.warehouse_stock
    where company_id = v_warehouse.company_id and warehouse_id = v_warehouse.id and material_id = v_material.id
    for update;
    if v_first_movement is not null then raise exception 'stock: el material ya tiene una apertura en ese almacen'; end if;
    if exists (select 1 from public.warehouse_stock where company_id = v_warehouse.company_id and material_id = v_material.id) then
      raise exception 'stock: el material tiene stock canonico y requiere revision';
    end if;
    insert into public.warehouse_stock(company_id, warehouse_id, material_id, quantity)
    values (v_warehouse.company_id, v_warehouse.id, v_material.id, v_item.quantity);
    insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key)
    values (v_warehouse.company_id, v_warehouse.id, v_material.id, 'Entrada', v_item.quantity, v_profile.id,
            v_source || ' · ' || v_reason || ' · batch=' || v_batch_key,
            'initial-batch:' || v_batch_key || ':' || v_material.id)
    returning id into v_first_movement;
  end loop;
  return v_first_movement;
end;
$$;

revoke all on function public.dmp_set_initial_warehouse_stock_batch(jsonb) from public;
revoke all on function public.dmp_set_initial_warehouse_stock_batch(jsonb) from anon;
grant execute on function public.dmp_set_initial_warehouse_stock_batch(jsonb) to authenticated;

commit;
