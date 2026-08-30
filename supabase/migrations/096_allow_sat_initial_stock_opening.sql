-- DoorManager Pro - SAT may open initial warehouse stock.
-- Keep the opening RPC's transaction, tenant and audit behavior unchanged.
begin;

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
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: solo SAT, Oficina, Gerencia o superadmin puede abrir stock inicial'; end if;
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

commit;
