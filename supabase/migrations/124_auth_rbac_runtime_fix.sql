-- DoorManager Pro - runtime fixes for user administration and purchases RBAC.
begin;

-- 1. Reconcile canonical purchase defaults by role (idempotent).
-- Individual grants remain additive and are not used to deny inherited permissions.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name in ('superadmin', 'Gerencia', 'Oficina')
  and p.code in (
    'purchase_orders.read',
    'purchase_orders.create',
    'purchase_orders.update',
    'purchase_orders.submit',
    'purchase_orders.cancel'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'purchase_orders.read'
where r.name = 'SAT'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'purchase_receipts.read'
where r.name = 'SAT'
on conflict do nothing;

-- Remove purchase permissions from roles that must not have them.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and (
    (r.name = 'SAT' and p.code in ('purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel'))
    or (r.name = 'SAT' and p.code in ('purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel'))
    or (r.name in ('Comercial','Tecnico') and p.code like 'purchase_orders.%')
    or (r.name in ('Comercial','Tecnico') and p.code like 'purchase_receipts.%')
  );

-- 2. dmp_admin_list_users: return expanded composite (fixes 42804).
create or replace function public.dmp_admin_list_users()
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('admin.users.read') then
    raise exception 'permiso: no puedes consultar usuarios';
  end if;

  return query
  select p.*
  from public.profiles p
  where public.is_platform_superadmin()
     or p.company_id = public.current_company_id()
  order by p.last_name, p.first_name, p.id;
end;
$$;

revoke all on function public.dmp_admin_list_users() from public, anon;
grant execute on function public.dmp_admin_list_users() to authenticated;

-- 3. Purchase order RPCs: migrate authorization from has_any_role to has_permission.

create or replace function public.dmp_create_purchase_order(
  p_company_id uuid, p_supplier_id uuid, p_order_date date default current_date,
  p_destination_warehouse_id uuid default null, p_supplier_reference text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_created_by uuid := public.current_profile_id();
begin
  perform public.assert_member_of_current_company(p_company_id);
  if not (public.has_permission('purchase_orders.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id and active and deleted_at is null) then raise exception 'empresa: proveedor no válido para la empresa'; end if;
  if p_destination_warehouse_id is not null and not exists (select 1 from public.warehouses where id = p_destination_warehouse_id and company_id = p_company_id and active and deleted_at is null) then raise exception 'empresa: almacén no válido para la empresa'; end if;
  insert into public.purchase_orders(company_id, code, supplier_id, order_date, destination_warehouse_id, supplier_reference, notes, created_by)
  values (p_company_id, public.next_dmp_code(p_company_id, 'purchase_orders', 'PED', true, 6), p_supplier_id, coalesce(p_order_date, current_date), p_destination_warehouse_id, nullif(p_supplier_reference, ''), nullif(p_notes, ''), v_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_update_purchase_order(
  p_purchase_order_id uuid, p_supplier_id uuid, p_order_date date,
  p_destination_warehouse_id uuid default null, p_supplier_reference text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_order public.purchase_orders%rowtype;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if not found or (not public.is_platform_superadmin() and v_order.company_id is distinct from public.current_company_id()) then raise exception 'pedido de compra: registro no disponible'; end if;
  if v_order.status <> 'draft' then raise exception 'pedido de compra: solo el borrador es editable'; end if;
  if not (public.has_permission('purchase_orders.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = v_order.company_id and active and deleted_at is null) then raise exception 'empresa: proveedor no válido para la empresa'; end if;
  if p_destination_warehouse_id is not null and not exists (select 1 from public.warehouses where id = p_destination_warehouse_id and company_id = v_order.company_id and active and deleted_at is null) then raise exception 'empresa: almacén no válido para la empresa'; end if;
  update public.purchase_orders set supplier_id = p_supplier_id, order_date = coalesce(p_order_date, order_date), destination_warehouse_id = p_destination_warehouse_id, supplier_reference = nullif(p_supplier_reference, ''), notes = nullif(p_notes, ''), updated_at = now() where id = p_purchase_order_id;
  return p_purchase_order_id;
end;
$$;

create or replace function public.dmp_add_purchase_order_line(
  p_purchase_order_id uuid, p_material_id uuid, p_material_supplier_id uuid,
  p_ordered_quantity numeric, p_unit_purchase_price numeric default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_order public.purchase_orders%rowtype; v_material public.materials%rowtype; v_supplier_relation public.material_suppliers%rowtype; v_price numeric; v_id uuid;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if not found or (not public.is_platform_superadmin() and v_order.company_id is distinct from public.current_company_id()) then raise exception 'pedido de compra: registro no disponible'; end if;
  if v_order.status <> 'draft' then raise exception 'pedido de compra: las líneas solo se añaden en borrador'; end if;
  if not (public.has_permission('purchase_orders.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  if p_ordered_quantity is null or p_ordered_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if p_unit_purchase_price is not null and p_unit_purchase_price < 0 then raise exception 'validacion del formulario: el precio de compra no puede ser negativo'; end if;
  select * into v_material from public.materials where id = p_material_id and company_id = v_order.company_id and active and deleted_at is null;
  if not found then raise exception 'empresa: material no válido para la empresa'; end if;
  if p_material_supplier_id is not null then
     select * into v_supplier_relation from public.material_suppliers where id = p_material_supplier_id and company_id = v_order.company_id and material_id = p_material_id and supplier_id = v_order.supplier_id and active;
    if not found then raise exception 'empresa: relación material-proveedor no válida para el pedido'; end if;
  end if;
  v_price := coalesce(p_unit_purchase_price, v_supplier_relation.purchase_unit_price);
  insert into public.purchase_order_lines(company_id, purchase_order_id, material_id, material_supplier_id, material_description_snapshot, supplier_reference_snapshot, unit_snapshot, ordered_quantity, unit_purchase_price)
  values (v_order.company_id, p_purchase_order_id, p_material_id, p_material_supplier_id, v_material.description, v_supplier_relation.supplier_reference, v_material.unit, p_ordered_quantity, v_price)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_update_purchase_order_line(
  p_line_id uuid, p_material_id uuid, p_material_supplier_id uuid,
  p_ordered_quantity numeric, p_unit_purchase_price numeric default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_line public.purchase_order_lines%rowtype; v_order public.purchase_orders%rowtype; v_material public.materials%rowtype; v_supplier_relation public.material_suppliers%rowtype; v_price numeric;
begin
  select * into v_line from public.purchase_order_lines where id = p_line_id;
  select * into v_order from public.purchase_orders where id = v_line.purchase_order_id;
  if not found or (not public.is_platform_superadmin() and v_order.company_id is distinct from public.current_company_id()) or v_order.status <> 'draft' then raise exception 'pedido de compra: línea no editable'; end if;
  if not (public.has_permission('purchase_orders.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  if p_ordered_quantity is null or p_ordered_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if p_unit_purchase_price is not null and p_unit_purchase_price < 0 then raise exception 'validacion del formulario: el precio de compra no puede ser negativo'; end if;
  select * into v_material from public.materials where id = p_material_id and company_id = v_order.company_id and active and deleted_at is null;
  if not found then raise exception 'empresa: material no válido para la empresa'; end if;
  if p_material_supplier_id is not null then
   select * into v_supplier_relation from public.material_suppliers where id = p_material_supplier_id and company_id = v_order.company_id and material_id = p_material_id and supplier_id = v_order.supplier_id and active;
    if not found then raise exception 'empresa: relación material-proveedor no válida para el pedido'; end if;
  end if;
  v_price := coalesce(p_unit_purchase_price, v_supplier_relation.purchase_unit_price);
  update public.purchase_order_lines set material_id = p_material_id, material_supplier_id = p_material_supplier_id, material_description_snapshot = v_material.description, supplier_reference_snapshot = v_supplier_relation.supplier_reference, unit_snapshot = v_material.unit, ordered_quantity = p_ordered_quantity, unit_purchase_price = v_price, updated_at = now() where id = p_line_id;
  return p_line_id;
end;
$$;

create or replace function public.dmp_remove_purchase_order_line(p_line_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.purchase_order_lines pol join public.purchase_orders po on po.id = pol.purchase_order_id where pol.id = p_line_id and (public.is_platform_superadmin() or po.company_id = public.current_company_id()) and po.status = 'draft') then raise exception 'pedido de compra: línea no eliminable'; end if;
  if not (public.has_permission('purchase_orders.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  delete from public.purchase_order_lines where id = p_line_id;
end;
$$;

create or replace function public.dmp_order_purchase_order(p_purchase_order_id uuid) returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.purchase_orders where id = p_purchase_order_id and (public.is_platform_superadmin() or company_id = public.current_company_id()) and status = 'draft') then raise exception 'pedido de compra: solo un borrador puede marcarse como pedido'; end if;
  if not (public.has_permission('purchase_orders.submit') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  if not exists (select 1 from public.purchase_order_lines where purchase_order_id = p_purchase_order_id) then raise exception 'pedido de compra: añade al menos una línea'; end if;
  if exists (select 1 from public.purchase_order_lines where purchase_order_id = p_purchase_order_id and unit_purchase_price is null) then raise exception 'pedido de compra: todas las líneas confirmadas necesitan precio acordado'; end if;
  update public.purchase_orders set status = 'ordered', updated_at = now() where id = p_purchase_order_id;
  return p_purchase_order_id;
end;
$$;

create or replace function public.dmp_cancel_purchase_order(p_purchase_order_id uuid) returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.purchase_orders where id = p_purchase_order_id and (public.is_platform_superadmin() or company_id = public.current_company_id()) and status in ('draft','ordered')) then raise exception 'pedido de compra: no se puede cancelar'; end if;
  if not (public.has_permission('purchase_orders.cancel') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  update public.purchase_orders set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = p_purchase_order_id;
  return p_purchase_order_id;
end;
$$;

-- 4. Purchase receipt RPCs: migrate authorization from has_any_role to has_permission.

create or replace function public.dmp_create_purchase_receipt(p_purchase_order_id uuid, p_receipt_date date, p_warehouse_id uuid, p_supplier_document_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_order public.purchase_orders; v_id uuid; v_company uuid;
begin
  if not (public.has_permission('purchase_receipts.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  select * into v_order from public.purchase_orders where id = p_purchase_order_id for update;
  if not found or (not public.is_platform_superadmin() and v_order.company_id <> public.current_company_id()) or v_order.status not in ('ordered','partially_received') then raise exception 'recepción: el pedido no está disponible para recibir'; end if;
  v_company := v_order.company_id;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and company_id = v_company and active and deleted_at is null) then raise exception 'recepción: almacén no válido'; end if;
  insert into public.purchase_receipts(company_id,purchase_order_id,code,receipt_date,warehouse_id,supplier_id,supplier_document_reference,notes,created_by) values(v_company,v_order.id,public.next_dmp_code(v_company,'purchase_receipts','REC',true,6),coalesce(p_receipt_date,current_date),p_warehouse_id,v_order.supplier_id,nullif(trim(p_supplier_document_reference),''),nullif(trim(p_notes),''),public.current_profile_id()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.dmp_update_purchase_receipt(p_receipt_id uuid, p_receipt_date date, p_warehouse_id uuid, p_supplier_document_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_receipt public.purchase_receipts;
begin
  if not (public.has_permission('purchase_receipts.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id for update;
  if not found or (not public.is_platform_superadmin() and v_receipt.company_id <> public.current_company_id()) or v_receipt.status <> 'draft' then raise exception 'recepción: borrador no disponible'; end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and company_id = v_receipt.company_id and active and deleted_at is null) then raise exception 'recepción: almacén no válido'; end if;
  update public.purchase_receipts set receipt_date=coalesce(p_receipt_date,receipt_date),warehouse_id=p_warehouse_id,supplier_document_reference=nullif(trim(p_supplier_document_reference),''),notes=nullif(trim(p_notes),'') where id=p_receipt_id;
  return p_receipt_id;
end; $$;

create or replace function public.dmp_add_purchase_receipt_line(p_receipt_id uuid, p_purchase_order_line_id uuid, p_received_quantity numeric, p_actual_unit_cost numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_receipt public.purchase_receipts; v_line public.purchase_order_lines; v_id uuid;
begin
  if not (public.has_permission('purchase_receipts.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 or p_actual_unit_cost is not null and p_actual_unit_cost < 0 then raise exception 'recepción: cantidad/coste no válidos'; end if;
  select * into v_receipt from public.purchase_receipts where id=p_receipt_id for update;
  if not found or (not public.is_platform_superadmin() and v_receipt.company_id <> public.current_company_id()) or v_receipt.status <> 'draft' then raise exception 'recepción: borrador no disponible'; end if;
  select * into v_line from public.purchase_order_lines where id=p_purchase_order_line_id and company_id=v_receipt.company_id;
  if not found or v_line.purchase_order_id <> v_receipt.purchase_order_id then raise exception 'recepción: línea no válida para el pedido'; end if;
  insert into public.purchase_receipt_lines(company_id,purchase_receipt_id,purchase_order_line_id,material_id,description_snapshot,unit_snapshot,supplier_reference_snapshot,received_quantity,actual_unit_cost) values(v_receipt.company_id,p_receipt_id,p_purchase_order_line_id,v_line.material_id,v_line.material_description_snapshot,v_line.unit_snapshot,v_line.supplier_reference_snapshot,p_received_quantity,coalesce(p_actual_unit_cost,v_line.unit_purchase_price)) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.dmp_update_purchase_receipt_line(p_receipt_line_id uuid, p_received_quantity numeric, p_actual_unit_cost numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_line public.purchase_receipt_lines; v_receipt public.purchase_receipts;
begin
  if not (public.has_permission('purchase_receipts.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 or p_actual_unit_cost is not null and p_actual_unit_cost < 0 then raise exception 'recepción: cantidad/coste no válidos'; end if;
  select * into v_line from public.purchase_receipt_lines where id=p_receipt_line_id;
  if not found then raise exception 'recepción: línea no disponible'; end if;
  select * into v_receipt from public.purchase_receipts where id=v_line.purchase_receipt_id for update;
  if not found or v_receipt.company_id <> v_line.company_id or (not public.is_platform_superadmin() and v_receipt.company_id <> public.current_company_id()) or v_receipt.status <> 'draft' then raise exception 'recepción: borrador no disponible'; end if;
  update public.purchase_receipt_lines set received_quantity=p_received_quantity,actual_unit_cost=coalesce(p_actual_unit_cost,actual_unit_cost) where id=p_receipt_line_id;
  return p_receipt_line_id;
end; $$;

create or replace function public.dmp_remove_purchase_receipt_line(p_receipt_line_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('purchase_receipts.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  if not exists (select 1 from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.id=p_receipt_line_id and pr.status='draft' and (public.is_platform_superadmin() or pr.company_id=public.current_company_id())) then raise exception 'recepción: línea no eliminable'; end if;
  delete from public.purchase_receipt_lines where id=p_receipt_line_id;
end; $$;

create or replace function public.dmp_confirm_purchase_receipt(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_receipt public.purchase_receipts; v_order public.purchase_orders; v_line public.purchase_receipt_lines; v_movement public.stock_movements; v_received numeric; v_key text; v_ordered numeric;
begin
  if not (public.has_permission('purchase_receipts.confirm') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes confirmar recepciones'; end if;
  select * into v_receipt from public.purchase_receipts where id=p_receipt_id for update;
  if not found or (not public.is_platform_superadmin() and v_receipt.company_id <> public.current_company_id()) then raise exception 'recepción: no disponible'; end if;
  if v_receipt.status = 'confirmed' then return p_receipt_id; end if;
  if v_receipt.status <> 'draft' then raise exception 'recepción: solo un borrador puede confirmarse'; end if;
  select * into v_order from public.purchase_orders where id=v_receipt.purchase_order_id for update;
  if not found or v_order.status not in ('ordered','partially_received') then raise exception 'recepción: el pedido no está disponible'; end if;
  if not exists (select 1 from public.purchase_receipt_lines where purchase_receipt_id=p_receipt_id) then raise exception 'recepción: añade al menos una línea'; end if;
  for v_line in select * from public.purchase_receipt_lines where purchase_receipt_id=p_receipt_id order by id loop
    if v_line.actual_unit_cost is null then raise exception 'recepción: todas las líneas necesitan coste real'; end if;
    select ordered_quantity into v_ordered from public.purchase_order_lines where id=v_line.purchase_order_line_id and company_id=v_receipt.company_id;
    select coalesce(sum(prl.received_quantity),0) into v_received from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.purchase_order_line_id=v_line.purchase_order_line_id and pr.status='confirmed' and prl.id<>v_line.id;
    if v_received + v_line.received_quantity > v_ordered then raise exception 'recepción: la cantidad supera la cantidad pendiente'; end if;
    v_key := 'purchase-receipt-line:' || v_line.id;
    perform public.dmp_adjust_warehouse_stock(v_receipt.warehouse_id,v_line.material_id,'Entrada',v_line.received_quantity,'Recepción ' || v_receipt.code,v_key);
    select * into v_movement from public.stock_movements where company_id=v_receipt.company_id and idempotency_key=v_key for update;
    if v_movement.id is null then raise exception 'recepción: no se creó el movimiento canónico'; end if;
    if v_movement.company_id <> v_receipt.company_id or v_movement.warehouse_id <> v_receipt.warehouse_id or v_movement.material_id <> v_line.material_id or v_movement.movement_type <> 'Entrada' or v_movement.quantity <> v_line.received_quantity or (v_movement.purchase_receipt_line_id is not null and v_movement.purchase_receipt_line_id <> v_line.id) or (v_movement.purchase_receipt_id is not null and v_movement.purchase_receipt_id <> v_receipt.id) or (v_movement.purchase_order_id is not null and v_movement.purchase_order_id <> v_receipt.purchase_order_id) or (v_movement.purchase_order_line_id is not null and v_movement.purchase_order_line_id <> v_line.purchase_order_line_id) or (v_movement.supplier_id is not null and v_movement.supplier_id <> v_receipt.supplier_id) or (v_movement.unit_cost is not null and v_movement.unit_cost <> v_line.actual_unit_cost) or (v_movement.source is not null and v_movement.source <> 'purchase_receipt') or (v_movement.source_reference is not null and v_movement.source_reference is distinct from v_receipt.supplier_document_reference) then raise exception 'conflicto: el movimiento idempotente no corresponde a esta recepción'; end if;
    update public.stock_movements set supplier_id=v_receipt.supplier_id,purchase_order_id=v_receipt.purchase_order_id,purchase_order_line_id=v_line.purchase_order_line_id,purchase_receipt_id=v_receipt.id,purchase_receipt_line_id=v_line.id,unit_cost=v_line.actual_unit_cost,source='purchase_receipt',source_reference=v_receipt.supplier_document_reference,notes=coalesce(notes,'') where id=v_movement.id;
  end loop;
  update public.purchase_receipts set status='confirmed',confirmed_at=now() where id=p_receipt_id;
  if exists (select 1 from public.purchase_order_lines pol where pol.purchase_order_id=v_order.id and coalesce((select sum(prl.received_quantity) from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.purchase_order_line_id=pol.id and pr.status='confirmed'),0) < pol.ordered_quantity) then update public.purchase_orders set status='partially_received',updated_at=now() where id=v_order.id; else update public.purchase_orders set status='received',updated_at=now() where id=v_order.id; end if;
  return p_receipt_id;
end; $$;

create or replace function public.dmp_cancel_draft_purchase_receipt(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission('purchase_receipts.cancel') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes cancelar recepciones'; end if;
  if not exists (select 1 from public.purchase_receipts where id=p_receipt_id and status='draft' and (public.is_platform_superadmin() or company_id=public.current_company_id())) then raise exception 'recepción: solo se puede cancelar un borrador'; end if;
  update public.purchase_receipts set status='cancelled' where id=p_receipt_id;
  return p_receipt_id;
end; $$;

-- 5. Preserve explicit module visibility overrides. NO mass false->true update.
-- The backfill in 123 used ON CONFLICT DO NOTHING which preserves existing overrides.
-- A superadmin may have intentionally hidden modules; do not overwrite.

-- 6. ACL grants for recreated functions.
revoke all on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_add_purchase_order_line(uuid, uuid, uuid, numeric, numeric) from public, anon;
revoke all on function public.dmp_update_purchase_order_line(uuid, uuid, uuid, numeric, numeric) from public, anon;
revoke all on function public.dmp_remove_purchase_order_line(uuid) from public, anon;
revoke all on function public.dmp_order_purchase_order(uuid) from public, anon;
revoke all on function public.dmp_cancel_purchase_order(uuid) from public, anon;
revoke all on function public.dmp_create_purchase_receipt(uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_update_purchase_receipt(uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_add_purchase_receipt_line(uuid, uuid, numeric, numeric) from public, anon;
revoke all on function public.dmp_update_purchase_receipt_line(uuid, numeric, numeric) from public, anon;
revoke all on function public.dmp_remove_purchase_receipt_line(uuid) from public, anon;
revoke all on function public.dmp_confirm_purchase_receipt(uuid) from public, anon;
revoke all on function public.dmp_cancel_draft_purchase_receipt(uuid) from public, anon;
grant execute on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_add_purchase_order_line(uuid, uuid, uuid, numeric, numeric) to authenticated;
grant execute on function public.dmp_update_purchase_order_line(uuid, uuid, uuid, numeric, numeric) to authenticated;
grant execute on function public.dmp_remove_purchase_order_line(uuid) to authenticated;
grant execute on function public.dmp_order_purchase_order(uuid) to authenticated;
grant execute on function public.dmp_cancel_purchase_order(uuid) to authenticated;
grant execute on function public.dmp_create_purchase_receipt(uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_update_purchase_receipt(uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_add_purchase_receipt_line(uuid, uuid, numeric, numeric) to authenticated;
grant execute on function public.dmp_update_purchase_receipt_line(uuid, numeric, numeric) to authenticated;
grant execute on function public.dmp_remove_purchase_receipt_line(uuid) to authenticated;
grant execute on function public.dmp_confirm_purchase_receipt(uuid) to authenticated;
grant execute on function public.dmp_cancel_draft_purchase_receipt(uuid) to authenticated;

commit;
