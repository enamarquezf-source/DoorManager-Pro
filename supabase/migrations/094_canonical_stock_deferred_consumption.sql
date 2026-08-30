-- DoorManager Pro - stock canonico por almacen y consumo diferido.
-- No hace backfill ni reconcilia materials.stock_quantity.
begin;

alter table public.work_order_materials
  add column if not exists stock_validation_status text not null default 'validated';
alter table public.work_order_materials
  add column if not exists stock_warehouse_id uuid references public.warehouses(id);
alter table public.work_order_materials
  add column if not exists stock_validated_at timestamptz;
alter table public.work_order_materials
  add column if not exists stock_validated_by uuid references public.profiles(id);
alter table public.work_order_materials
  add column if not exists stock_movement_id uuid references public.stock_movements(id);

alter table public.work_order_materials
  drop constraint if exists work_order_materials_stock_validation_status_check;
alter table public.work_order_materials
  add constraint work_order_materials_stock_validation_status_check
  check (stock_validation_status in ('pending', 'validated', 'rejected'));

alter table public.stock_movements
  add column if not exists work_order_material_id uuid references public.work_order_materials(id);
alter table public.stock_movements
  add column if not exists idempotency_key text;
create unique index if not exists stock_movements_work_order_material_once
  on public.stock_movements(work_order_material_id)
  where work_order_material_id is not null and movement_type = 'Consumo en parte';
create unique index if not exists stock_movements_company_idempotency_key
  on public.stock_movements(company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists work_order_materials_pending_stock_idx
  on public.work_order_materials(company_id, stock_validation_status)
  where deleted_at is null and stock_validation_status = 'pending';

create or replace function public.dmp_submit_work_order_material(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_material public.materials;
  v_usage public.work_order_materials;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_material_id uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_warehouse_id uuid := nullif(p_payload->>'warehouse_id', '')::uuid;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 1);
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
begin
  if nullif(p_payload->>'work_order_id', '') is null then
    raise exception 'validacion del formulario: falta work_order_id';
  end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if v_material_id is null and trim(coalesce(p_payload->>'description', '')) = '' then
    raise exception 'validacion del formulario: indica material de catalogo o descripcion no catalogada';
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
  end if;
  if v_usage.id is null then
    insert into public.work_order_materials(
      company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit,
      unit_cost, unit_price, notes, registered_by, used_at, local_change_id, stock_deducted_quantity,
      stock_validation_status, stock_warehouse_id
    ) values (
      v_work.company_id, v_work.id, v_material_id, nullif(p_payload->>'description', ''), 0, v_quantity,
      coalesce(nullif(p_payload->>'unit', ''), v_material.unit, 'ud'),
      case when v_material_id is null then 0 else coalesce(v_material.cost, 0) end,
      case when v_admin then coalesce(nullif(p_payload->>'unit_price', '')::numeric, v_material.price, 0) else 0 end,
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
  return v_usage.id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.dmp_validate_work_order_material(p_work_order_material_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_usage public.work_order_materials;
  v_material public.materials;
  v_stock public.warehouse_stock;
  v_new numeric;
  v_movement uuid;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: solo backoffice puede validar consumos'; end if;
  select * into v_usage from public.work_order_materials where id = p_work_order_material_id and deleted_at is null for update;
  if v_usage.id is null then raise exception 'material: consumo no encontrado'; end if;
  if v_usage.stock_validation_status = 'validated' then return v_usage.id; end if;
  if v_usage.stock_validation_status <> 'pending' then raise exception 'stock: estado de consumo no validable'; end if;
  if v_usage.material_id is null or v_usage.stock_warehouse_id is null then raise exception 'stock: consumo sin material o almacen'; end if;
  select * into v_material from public.materials where id = v_usage.material_id and company_id = v_usage.company_id and deleted_at is null for update;
  select * into v_stock from public.warehouse_stock where company_id = v_usage.company_id and warehouse_id = v_usage.stock_warehouse_id and material_id = v_usage.material_id for update;
  if v_stock.id is null then raise exception 'stock: no existe saldo abierto para el almacen'; end if;
  v_new := v_stock.quantity - v_usage.used_quantity;
  if v_new < 0 and not coalesce(v_material.allow_negative_stock, false) then raise exception 'stock: stock insuficiente para %', v_material.code; end if;
  update public.warehouse_stock set quantity = v_new, updated_at = now() where id = v_stock.id;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, work_order_id, created_by, notes, work_order_material_id, idempotency_key)
  values (v_usage.company_id, v_usage.stock_warehouse_id, v_usage.material_id, 'Consumo en parte', v_usage.used_quantity, v_usage.work_order_id, v_profile.id, 'Validacion de consumo en parte', v_usage.id, 'work-order-material:' || v_usage.id)
  returning id into v_movement;
  update public.work_order_materials set stock_validation_status = 'validated', stock_deducted_quantity = used_quantity,
    stock_validated_at = now(), stock_validated_by = v_profile.id, stock_movement_id = v_movement, updated_at = now()
  where id = v_usage.id;
  return v_usage.id;
exception when unique_violation then
  select id into v_movement from public.stock_movements where work_order_material_id = p_work_order_material_id and movement_type = 'Consumo en parte';
  update public.work_order_materials set stock_validation_status = 'validated', stock_deducted_quantity = used_quantity, stock_validated_at = coalesce(stock_validated_at, now()), stock_movement_id = v_movement, updated_at = now() where id = p_work_order_material_id;
  return p_work_order_material_id;
end;
$$;

create or replace function public.dmp_set_initial_warehouse_stock(p_warehouse_id uuid, p_material_id uuid, p_quantity numeric, p_reason text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_warehouse public.warehouses;
  v_material public.materials;
  v_stock public.warehouse_stock;
  v_movement uuid;
begin
  -- Initial inventory is administrative/logistics work. A future Almacen/Compras
  -- capability can be added here without granting it to technical validation.
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: solo Oficina, Gerencia o superadmin puede abrir stock inicial'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'validacion del formulario: la apertura no puede ser negativa'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo de apertura es obligatorio'; end if;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and company_id = public.current_company_id() and active and deleted_at is null;
  select * into v_material from public.materials where id = p_material_id and company_id = public.current_company_id() and deleted_at is null;
  if v_warehouse.id is null then raise exception 'stock: almacen no valido para la empresa'; end if;
  if v_material.id is null then raise exception 'material: material no valido para la empresa'; end if;
  select * into v_stock from public.warehouse_stock where warehouse_id = p_warehouse_id and material_id = p_material_id for update;
  if v_stock.id is not null then raise exception 'stock: el material ya tiene una apertura en ese almacen'; end if;
  insert into public.warehouse_stock(company_id, warehouse_id, material_id, quantity) values (v_material.company_id, p_warehouse_id, p_material_id, p_quantity) returning * into v_stock;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key)
  values (v_material.company_id, p_warehouse_id, p_material_id, 'Entrada', p_quantity, v_profile.id, p_reason, 'initial:' || p_warehouse_id || ':' || p_material_id)
  returning id into v_movement;
  return v_stock.id;
exception when unique_violation then
  raise exception 'conflicto: otro usuario ha abierto ya el stock de este material en ese almacen';
end;
$$;

revoke all on function public.dmp_submit_work_order_material(jsonb) from public;
revoke all on function public.dmp_submit_work_order_material(jsonb) from anon;
grant execute on function public.dmp_submit_work_order_material(jsonb) to authenticated;
revoke all on function public.dmp_validate_work_order_material(uuid) from public;
revoke all on function public.dmp_validate_work_order_material(uuid) from anon;
grant execute on function public.dmp_validate_work_order_material(uuid) to authenticated;
revoke all on function public.dmp_set_initial_warehouse_stock(uuid, uuid, numeric, text) from public;
revoke all on function public.dmp_set_initial_warehouse_stock(uuid, uuid, numeric, text) from anon;
grant execute on function public.dmp_set_initial_warehouse_stock(uuid, uuid, numeric, text) to authenticated;
-- Keep the legacy implementation for historical compatibility, but remove its
-- direct entry point so new clients cannot bypass pending validation.
revoke all on function public.dmp_upsert_work_order_material(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_material(jsonb) from anon;
revoke all on function public.dmp_upsert_work_order_material(jsonb) from authenticated;

commit;
