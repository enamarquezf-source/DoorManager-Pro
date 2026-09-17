-- DoorManager Pro - atomic material import and warehouse transfer.
begin;

-- The legacy exact-case constraint is not sufficient for the case-insensitive
-- code matching used by the import contract.
do $$
begin
  if exists (
    select 1
    from public.materials
    group by company_id, lower(trim(code))
    having count(*) > 1
  ) then
    raise exception '134 precheck failed: duplicate material codes ignoring case';
  end if;
end $$;

create unique index if not exists materials_company_code_ci_unique
  on public.materials (company_id, lower(trim(code)));

-- This table is not part of the catalog or stock model. It is only the durable
-- idempotency record for a validated import request.
create table if not exists public.material_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  warehouse_id uuid not null references public.warehouses(id),
  idempotency_key text not null,
  payload_fingerprint text not null,
  item_count integer not null check (item_count > 0),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  first_movement_id uuid references public.stock_movements(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint material_import_batches_key_unique unique (company_id, idempotency_key)
);

alter table public.material_import_batches enable row level security;
revoke all on public.material_import_batches from public, anon, authenticated;

alter table public.stock_movements
  add column if not exists transfer_group_id uuid;
create index if not exists stock_movements_transfer_group_idx
  on public.stock_movements(company_id, transfer_group_id)
  where transfer_group_id is not null;

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

  -- Validate the complete payload before creating or updating anything.
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
  v_fingerprint := encode(public.digest(convert_to(v_warehouse_id::text || ':' || v_canonical::text, 'UTF8'), 'sha256'), 'hex');

  -- Serialize all retries for this company/key before inspecting the batch.
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

create or replace function public.dmp_transfer_warehouse_stock(
  p_material_id uuid,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_company uuid := public.current_company_id();
  v_material public.materials;
  v_source public.warehouse_stock;
  v_destination public.warehouse_stock;
  v_existing_out public.stock_movements;
  v_existing_in public.stock_movements;
  v_transfer_id uuid := md5(v_company::text || ':warehouse-transfer:' || trim(p_idempotency_key))::uuid;
  v_out_key text := 'warehouse-transfer:' || trim(p_idempotency_key) || ':out';
  v_in_key text := 'warehouse-transfer:' || trim(p_idempotency_key) || ':in';
begin
  if not public.has_permission('stock.adjust') then
    raise exception 'permiso: no tienes permiso para transferir stock';
  end if;
  if p_source_warehouse_id = p_destination_warehouse_id
     or p_quantity is null
     or p_quantity <= 0
     or trim(coalesce(p_reason, '')) = ''
     or trim(coalesce(p_idempotency_key, '')) = '' then
    raise exception 'validacion del formulario: transferencia no valida';
  end if;

  -- This lock is before the idempotency lookup. It serializes same-key retries.
  perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':warehouse-transfer:' || trim(p_idempotency_key), 0));
  select * into v_existing_out
  from public.stock_movements
  where company_id = v_company and idempotency_key = v_out_key;
  select * into v_existing_in
  from public.stock_movements
  where company_id = v_company and idempotency_key = v_in_key;
  if v_existing_out.id is not null and v_existing_in.id is null then
    raise exception 'conflicto: transferencia previa incompleta';
  end if;
  if v_existing_out.id is null and v_existing_in.id is not null then
    raise exception 'conflicto: transferencia previa incompleta';
  end if;
  if v_existing_out.id is not null and v_existing_in.id is not null then
    if v_existing_out.transfer_group_id is distinct from v_transfer_id
       or v_existing_in.transfer_group_id is distinct from v_transfer_id
       or v_existing_out.material_id <> p_material_id
       or v_existing_in.material_id <> p_material_id
       or v_existing_out.warehouse_id <> p_source_warehouse_id
       or v_existing_in.warehouse_id <> p_destination_warehouse_id
       or v_existing_out.quantity <> p_quantity
       or v_existing_in.quantity <> p_quantity
       or v_existing_out.movement_type <> 'Salida'
       or v_existing_in.movement_type <> 'Entrada'
       or v_existing_out.notes is distinct from 'Transferencia a almacen destino - ' || p_reason
       or v_existing_in.notes is distinct from 'Transferencia desde almacen origen - ' || p_reason then
      raise exception 'conflicto: la clave idempotente ya se uso para otra transferencia';
    end if;
    return v_existing_out.id;
  end if;

  select * into v_material from public.materials where id = p_material_id and company_id = v_company and deleted_at is null;
  if not found then raise exception 'stock: material no valido para la empresa'; end if;
  if not exists (
    select 1 from public.warehouses
    where id in (p_source_warehouse_id, p_destination_warehouse_id)
      and company_id = v_company and active and deleted_at is null
    group by company_id having count(*) = 2
  ) then raise exception 'stock: almacenes no validos para la empresa'; end if;

  insert into public.warehouse_stock(company_id, warehouse_id, material_id, quantity)
  select v_company, candidate.warehouse_id, p_material_id, 0
  from (values (p_source_warehouse_id), (p_destination_warehouse_id)) as candidate(warehouse_id)
  order by candidate.warehouse_id
  on conflict (warehouse_id, material_id) do nothing;
  -- PostgreSQL locks both rows in warehouse_id order before either balance is read.
  perform 1 from public.warehouse_stock
  where company_id = v_company and material_id = p_material_id
    and warehouse_id in (p_source_warehouse_id, p_destination_warehouse_id)
  order by warehouse_id for update;
  select * into v_source from public.warehouse_stock where company_id = v_company and warehouse_id = p_source_warehouse_id and material_id = p_material_id;
  select * into v_destination from public.warehouse_stock where company_id = v_company and warehouse_id = p_destination_warehouse_id and material_id = p_material_id;
  if v_source.quantity < p_quantity then
    raise exception 'stock: stock insuficiente para transferir % (disponible: %, solicitado: %)', v_material.code, v_source.quantity, p_quantity;
  end if;
  update public.warehouse_stock set quantity = quantity - p_quantity, updated_at = now() where id = v_source.id;
  update public.warehouse_stock set quantity = quantity + p_quantity, updated_at = now() where id = v_destination.id;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key, source, source_reference, transfer_group_id)
  values (v_company, p_source_warehouse_id, p_material_id, 'Salida', p_quantity, v_profile.id, 'Transferencia a almacen destino - ' || p_reason, v_out_key, 'warehouse_transfer', trim(p_idempotency_key), v_transfer_id)
  returning * into v_existing_out;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key, source, source_reference, transfer_group_id)
  values (v_company, p_destination_warehouse_id, p_material_id, 'Entrada', p_quantity, v_profile.id, 'Transferencia desde almacen origen - ' || p_reason, v_in_key, 'warehouse_transfer', trim(p_idempotency_key), v_transfer_id)
  returning * into v_existing_in;
  return v_existing_out.id;
end;
$$;

revoke all on function public.dmp_import_material_stock(jsonb) from public, anon;
grant execute on function public.dmp_import_material_stock(jsonb) to authenticated;
revoke all on function public.dmp_transfer_warehouse_stock(uuid,uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.dmp_transfer_warehouse_stock(uuid,uuid,uuid,numeric,text,text) to authenticated;

commit;
