-- DoorManager Pro - qualify pgcrypto for the applied material import RPC.
begin;

create or replace function public.dmp_import_material_stock(p_payload jsonb)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_company uuid := public.current_company_id();
  v_warehouse public.warehouses;
  v_material public.materials;
  v_batch public.material_import_batches;
  v_item record;
  v_duplicate_code text;
  v_canonical jsonb;
  v_fingerprint text;
  v_first uuid;
  v_movement uuid;
  v_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_warehouse_id uuid := nullif(p_payload->>'warehouse_id', '')::uuid;
  v_items jsonb := p_payload->'items';
begin
  if not public.has_permission('stock.adjust') then
    raise exception 'permiso: no tienes permiso para importar stock';
  end if;
  if not public.has_permission('materials.create') and not public.has_permission('materials.update') then
    raise exception 'permiso: no puedes gestionar materiales';
  end if;
  if v_key is null or v_warehouse_id is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'validacion del formulario: lote de importacion incompleto';
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) item where jsonb_typeof(item) <> 'object') then
    raise exception 'validacion del formulario: cada fila debe ser un objeto';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_items) as item(code text, description text, unit text, quantity numeric)
    where trim(coalesce(item.code, '')) = ''
       or trim(coalesce(item.description, '')) = ''
       or item.quantity is null
       or item.quantity <= 0
  ) then
    raise exception 'validacion del formulario: cada fila necesita codigo, descripcion y cantidad mayor que cero';
  end if;
  select lower(trim(item.code)) into v_duplicate_code
  from jsonb_to_recordset(v_items) as item(code text, description text, unit text, quantity numeric)
  group by lower(trim(item.code))
  having count(*) > 1
  limit 1;
  if v_duplicate_code is not null then
    raise exception 'validacion del formulario: codigo duplicado en el lote: %', v_duplicate_code;
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = v_warehouse_id
    and company_id = v_company
    and active
    and deleted_at is null;
  if not found then raise exception 'stock: almacen no valido para la empresa'; end if;

  select jsonb_agg(
    jsonb_build_object(
      'code', lower(trim(item.code)),
      'description', trim(item.description),
      'unit', nullif(trim(item.unit), ''),
      'quantity', item.quantity
    ) order by lower(trim(item.code))
  ) into v_canonical
  from jsonb_to_recordset(v_items) as item(code text, description text, unit text, quantity numeric);
  v_fingerprint := encode(extensions.digest(convert_to(v_warehouse_id::text || ':' || v_canonical::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':material-import:' || v_key, 0));
  insert into public.material_import_batches(company_id, warehouse_id, idempotency_key, payload_fingerprint, item_count, status, created_by)
  values (v_company, v_warehouse_id, v_key, v_fingerprint, jsonb_array_length(v_items), 'pending', v_profile.id)
  on conflict (company_id, idempotency_key) do nothing
  returning * into v_batch;
  if not found then
    select * into v_batch from public.material_import_batches where company_id = v_company and idempotency_key = v_key for update;
    if v_batch.payload_fingerprint <> v_fingerprint
       or v_batch.warehouse_id <> v_warehouse_id
       or v_batch.item_count <> jsonb_array_length(v_items) then
      raise exception 'conflicto: la clave idempotente ya se uso para otra importacion';
    end if;
    if v_batch.status <> 'completed' or v_batch.first_movement_id is null then
      raise exception 'conflicto: el lote de importacion anterior esta incompleto';
    end if;
    return v_batch.first_movement_id;
  end if;

  for v_item in select * from jsonb_to_recordset(v_items) as item(code text, description text, unit text, quantity numeric) loop
    select * into v_material
    from public.materials
    where company_id = v_company
      and lower(trim(code)) = lower(trim(v_item.code))
    for update;
    if found then
      if not public.has_permission('materials.update') then
        raise exception 'permiso: se necesita materials.update para actualizar materiales existentes';
      end if;
      update public.materials
      set description = trim(v_item.description),
          unit = coalesce(nullif(trim(v_item.unit), ''), unit),
          updated_at = now()
      where id = v_material.id;
    else
      if not public.has_permission('materials.create') then
        raise exception 'permiso: se necesita materials.create para crear materiales';
      end if;
      insert into public.materials(company_id, code, description, unit)
      values (v_company, trim(v_item.code), trim(v_item.description), coalesce(nullif(trim(v_item.unit), ''), 'ud'))
      returning * into v_material;
    end if;
    perform public.dmp_adjust_warehouse_stock(
      v_warehouse.id,
      v_material.id,
      'Entrada',
      v_item.quantity,
      'Importacion de materiales - lote=' || v_key,
      'material-import:' || v_batch.id::text || ':' || v_material.id::text
    );
    select id into v_movement
    from public.stock_movements
    where company_id = v_company
      and idempotency_key = 'material-import:' || v_batch.id::text || ':' || v_material.id::text;
    if not found or v_movement is null then
      raise exception 'integridad: no se ha creado el movimiento canonico de importacion';
    end if;
    if v_first is null then v_first := v_movement; end if;
  end loop;
  update public.material_import_batches
  set status = 'completed', first_movement_id = v_first
  where id = v_batch.id;
  return v_first;
end;
$$;

commit;
