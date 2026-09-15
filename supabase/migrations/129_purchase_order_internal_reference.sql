-- DoorManager Pro - purchase order internal reference.
begin;

alter table public.purchase_orders
  add column if not exists internal_reference text;

create or replace function public.dmp_purchase_order_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 and new.company_id = old.company_id and new.code = old.code and new.supplier_id = old.supplier_id and new.order_date = old.order_date and new.destination_warehouse_id is not distinct from old.destination_warehouse_id and new.supplier_reference is not distinct from old.supplier_reference and new.internal_reference is not distinct from old.internal_reference and new.notes is not distinct from old.notes and new.created_by is not distinct from old.created_by and new.created_at = old.created_at and new.status = old.status then
    return new;
  end if;
  if new.company_id is distinct from old.company_id or new.code is distinct from old.code or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.subtotal is distinct from old.subtotal or new.total_amount is distinct from old.total_amount then
    raise exception 'pedido de compra: campos canónicos protegidos';
  end if;
  if old.status = 'draft' and new.status not in ('draft','ordered','cancelled') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status = 'ordered' and new.status not in ('ordered','partially_received','received','cancelled') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status = 'partially_received' and new.status not in ('partially_received','received') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status in ('received','cancelled') and new.status is distinct from old.status then raise exception 'pedido de compra: el pedido está congelado'; end if;
  if new.status = 'cancelled' and old.status = 'ordered' and exists (select 1 from public.purchase_receipts where purchase_order_id = new.id and status = 'confirmed') then raise exception 'pedido de compra: no se puede cancelar con recepciones confirmadas'; end if;
  if new.status = 'ordered' and (not exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id) or exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id and unit_purchase_price is null)) then raise exception 'pedido de compra: todas las líneas confirmadas necesitan precio acordado'; end if;
  if old.status <> 'draft' and (new.supplier_id is distinct from old.supplier_id or new.order_date is distinct from old.order_date or new.destination_warehouse_id is distinct from old.destination_warehouse_id or new.supplier_reference is distinct from old.supplier_reference or new.internal_reference is distinct from old.internal_reference or new.notes is distinct from old.notes) then
    raise exception 'pedido de compra: solo el borrador es editable';
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end;
$$;

drop function if exists public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text);
drop function if exists public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text);

create or replace function public.dmp_create_purchase_order(
  p_company_id uuid, p_supplier_id uuid, p_order_date date,
  p_destination_warehouse_id uuid, p_supplier_reference text,
  p_notes text, p_internal_reference text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_created_by uuid := public.current_profile_id();
begin
  perform public.assert_member_of_current_company(p_company_id);
  if not public.is_platform_superadmin() and p_company_id is distinct from public.current_company_id() then raise exception 'pedido de compra: registro no disponible'; end if;
  if not (public.has_permission('purchase_orders.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id and active and deleted_at is null) then raise exception 'empresa: proveedor no válido para la empresa'; end if;
  if p_destination_warehouse_id is not null and not exists (select 1 from public.warehouses where id = p_destination_warehouse_id and company_id = p_company_id and active and deleted_at is null) then raise exception 'empresa: almacén no válido para la empresa'; end if;
  insert into public.purchase_orders(company_id, code, supplier_id, order_date, destination_warehouse_id, supplier_reference, internal_reference, notes, created_by)
  values (p_company_id, public.next_dmp_code(p_company_id, 'purchase_orders', 'PED', true, 6), p_supplier_id, coalesce(p_order_date, current_date), p_destination_warehouse_id, nullif(p_supplier_reference, ''), nullif(p_internal_reference, ''), nullif(p_notes, ''), v_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_update_purchase_order(
  p_purchase_order_id uuid, p_supplier_id uuid, p_order_date date,
  p_destination_warehouse_id uuid, p_supplier_reference text,
  p_notes text, p_internal_reference text
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
  update public.purchase_orders set supplier_id = p_supplier_id, order_date = coalesce(p_order_date, order_date), destination_warehouse_id = p_destination_warehouse_id, supplier_reference = nullif(p_supplier_reference, ''), internal_reference = nullif(p_internal_reference, ''), notes = nullif(p_notes, ''), updated_at = now() where id = p_purchase_order_id;
  return p_purchase_order_id;
end;
$$;

create or replace function public.dmp_create_purchase_order(
  p_company_id uuid, p_supplier_id uuid, p_order_date date default current_date,
  p_destination_warehouse_id uuid default null, p_supplier_reference text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  return public.dmp_create_purchase_order(p_company_id, p_supplier_id, p_order_date, p_destination_warehouse_id, p_supplier_reference, p_notes, null);
end;
$$;

create or replace function public.dmp_update_purchase_order(
  p_purchase_order_id uuid, p_supplier_id uuid, p_order_date date,
  p_destination_warehouse_id uuid default null, p_supplier_reference text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_internal_reference text;
begin
  select internal_reference into v_internal_reference
  from public.purchase_orders
  where id = p_purchase_order_id;
  return public.dmp_update_purchase_order(p_purchase_order_id, p_supplier_id, p_order_date, p_destination_warehouse_id, p_supplier_reference, p_notes, v_internal_reference);
end;
$$;

revoke all on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text, text) from public, anon;
revoke all on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text, text) from public, anon;
grant execute on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text, text) to authenticated;
grant execute on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text, text) to authenticated;

commit;
