-- DoorManager Pro - purchase orders foundation. No physical reception or stock entry.
begin;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.warehouses'::regclass and conname = 'warehouses_company_id_id_unique') then
    alter table public.warehouses add constraint warehouses_company_id_id_unique unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.material_suppliers'::regclass and conname = 'material_suppliers_company_id_id_unique') then
    alter table public.material_suppliers add constraint material_suppliers_company_id_id_unique unique (company_id, id);
  end if;
end $$;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  supplier_id uuid not null,
  order_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','ordered','cancelled')),
  destination_warehouse_id uuid,
  supplier_reference text,
  notes text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint purchase_orders_company_code_unique unique (company_id, code),
  constraint purchase_orders_company_id_id_unique unique (company_id, id),
  constraint purchase_orders_supplier_company_fk foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  constraint purchase_orders_warehouse_company_fk foreign key (company_id, destination_warehouse_id) references public.warehouses(company_id, id)
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  purchase_order_id uuid not null,
  material_id uuid not null,
  material_supplier_id uuid,
  material_description_snapshot text not null,
  supplier_reference_snapshot text,
  unit_snapshot text not null,
  ordered_quantity numeric(12,2) not null check (ordered_quantity > 0),
  unit_purchase_price numeric(12,2) check (unit_purchase_price is null or unit_purchase_price >= 0),
  subtotal numeric(12,2) check (subtotal is null or subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_lines_order_company_fk foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id) on delete cascade,
  constraint purchase_order_lines_material_company_fk foreign key (company_id, material_id) references public.materials(company_id, id),
  constraint purchase_order_lines_supplier_company_fk foreign key (company_id, material_supplier_id) references public.material_suppliers(company_id, id)
);

create index purchase_orders_company_status_idx on public.purchase_orders(company_id, status, order_date desc);
create index purchase_orders_supplier_idx on public.purchase_orders(company_id, supplier_id, order_date desc);
create index purchase_orders_warehouse_idx on public.purchase_orders(company_id, destination_warehouse_id, order_date desc);
create index purchase_order_lines_order_idx on public.purchase_order_lines(company_id, purchase_order_id);
create index purchase_order_lines_material_idx on public.purchase_order_lines(company_id, material_id);

create or replace function public.dmp_purchase_order_refresh_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.purchase_orders
  set subtotal = coalesce((select round(sum(pol.subtotal), 2) from public.purchase_order_lines pol where pol.purchase_order_id = coalesce(new.purchase_order_id, old.purchase_order_id)), 0),
      total_amount = coalesce((select round(sum(pol.subtotal), 2) from public.purchase_order_lines pol where pol.purchase_order_id = coalesce(new.purchase_order_id, old.purchase_order_id)), 0),
      updated_at = now()
  where id = coalesce(new.purchase_order_id, old.purchase_order_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.dmp_purchase_order_line_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.subtotal := case when new.unit_purchase_price is null then null else round(new.ordered_quantity * new.unit_purchase_price, 2) end;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.dmp_purchase_order_status_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 and new.company_id = old.company_id and new.code = old.code and new.supplier_id = old.supplier_id and new.order_date = old.order_date and new.destination_warehouse_id is not distinct from old.destination_warehouse_id and new.supplier_reference is not distinct from old.supplier_reference and new.notes is not distinct from old.notes and new.created_by is not distinct from old.created_by and new.created_at = old.created_at and new.status = old.status then
    return new;
  end if;
  if new.company_id is distinct from old.company_id or new.code is distinct from old.code or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at or new.subtotal is distinct from old.subtotal or new.total_amount is distinct from old.total_amount then
    raise exception 'pedido de compra: campos canónicos protegidos';
  end if;
  if old.status = 'draft' and new.status not in ('draft','ordered','cancelled') then
    raise exception 'pedido de compra: transición de estado no válida';
  end if;
  if old.status = 'ordered' and new.status not in ('ordered','cancelled') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status = 'cancelled' and new.status is distinct from old.status then raise exception 'pedido de compra: el pedido cancelado está congelado'; end if;
  if new.status = 'ordered' and (not exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id) or exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id and unit_purchase_price is null)) then raise exception 'pedido de compra: todas las líneas confirmadas necesitan precio acordado'; end if;
  if old.status <> 'draft' and (new.supplier_id is distinct from old.supplier_id or new.order_date is distinct from old.order_date or new.destination_warehouse_id is distinct from old.destination_warehouse_id or new.supplier_reference is distinct from old.supplier_reference or new.notes is distinct from old.notes) then
    raise exception 'pedido de compra: solo el borrador es editable';
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end;
$$;

create or replace function public.dmp_purchase_order_line_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order public.purchase_orders%rowtype;
  v_material public.materials%rowtype;
  v_supplier_relation public.material_suppliers%rowtype;
begin
  v_order_id := case when tg_op = 'DELETE' then old.purchase_order_id else new.purchase_order_id end;
  select * into v_order from public.purchase_orders where id = v_order_id;
  if not found or v_order.status <> 'draft' then
    raise exception 'pedido de compra: las líneas solo son editables en borrador';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.company_id is distinct from v_order.company_id then raise exception 'empresa: la línea no pertenece al pedido'; end if;
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.purchase_order_id is distinct from old.purchase_order_id) then raise exception 'pedido de compra: empresa y pedido de la línea no son editables'; end if;
  select * into v_material from public.materials where id = new.material_id and company_id = v_order.company_id and active and deleted_at is null;
  if not found then raise exception 'empresa: material no válido para la empresa'; end if;
  if new.material_supplier_id is not null then
    select * into v_supplier_relation from public.material_suppliers where id = new.material_supplier_id and company_id = v_order.company_id and material_id = new.material_id and supplier_id = v_order.supplier_id and active;
    if not found then raise exception 'empresa: relación material-proveedor no válida para el pedido'; end if;
  end if;
  new.material_description_snapshot := v_material.description;
  new.supplier_reference_snapshot := v_supplier_relation.supplier_reference;
  new.unit_snapshot := v_material.unit;
  new.subtotal := case when new.unit_purchase_price is null then null else round(new.ordered_quantity * new.unit_purchase_price, 2) end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists purchase_order_line_totals_trigger on public.purchase_order_lines;
create trigger purchase_order_line_totals_trigger before insert or update on public.purchase_order_lines for each row execute function public.dmp_purchase_order_line_totals();
drop trigger if exists purchase_order_line_guard_trigger on public.purchase_order_lines;
create trigger purchase_order_line_guard_trigger before insert or update or delete on public.purchase_order_lines for each row execute function public.dmp_purchase_order_line_guard();
drop trigger if exists purchase_order_totals_trigger on public.purchase_order_lines;
create trigger purchase_order_totals_trigger after insert or update or delete on public.purchase_order_lines for each row execute function public.dmp_purchase_order_refresh_totals();
drop trigger if exists purchase_order_status_guard_trigger on public.purchase_orders;
create trigger purchase_order_status_guard_trigger before update on public.purchase_orders for each row execute function public.dmp_purchase_order_status_guard();

create or replace function public.dmp_create_purchase_order(
  p_company_id uuid, p_supplier_id uuid, p_order_date date default current_date,
  p_destination_warehouse_id uuid default null, p_supplier_reference text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_created_by uuid := public.current_profile_id();
begin
  perform public.assert_member_of_current_company(p_company_id);
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
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
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
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
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
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
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
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
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  delete from public.purchase_order_lines where id = p_line_id;
end;
$$;

create or replace function public.dmp_order_purchase_order(p_purchase_order_id uuid) returns uuid
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.purchase_orders where id = p_purchase_order_id and (public.is_platform_superadmin() or company_id = public.current_company_id()) and status = 'draft') then raise exception 'pedido de compra: solo un borrador puede marcarse como pedido'; end if;
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
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
  if not (public.has_any_role(array['superadmin','Gerencia','Oficina']) or public.is_platform_superadmin()) then raise exception 'permiso: no puedes gestionar pedidos de compra'; end if;
  update public.purchase_orders set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = p_purchase_order_id;
  return p_purchase_order_id;
end;
$$;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;

create policy purchase_orders_select_backoffice on public.purchase_orders for select to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy purchase_orders_insert_backoffice on public.purchase_orders for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy purchase_orders_update_backoffice on public.purchase_orders for update to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina'])) with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy purchase_order_lines_select_backoffice on public.purchase_order_lines for select to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy purchase_order_lines_insert_backoffice on public.purchase_order_lines for insert to authenticated with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy purchase_order_lines_update_backoffice on public.purchase_order_lines for update to authenticated using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina'])) with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));

create policy purchase_orders_platform_superadmin_select on public.purchase_orders for select to authenticated using (public.is_platform_superadmin());
create policy purchase_orders_platform_superadmin_insert on public.purchase_orders for insert to authenticated with check (public.is_platform_superadmin());
create policy purchase_orders_platform_superadmin_update on public.purchase_orders for update to authenticated using (public.is_platform_superadmin()) with check (public.is_platform_superadmin());
create policy purchase_order_lines_platform_superadmin_select on public.purchase_order_lines for select to authenticated using (public.is_platform_superadmin());
create policy purchase_order_lines_platform_superadmin_insert on public.purchase_order_lines for insert to authenticated with check (public.is_platform_superadmin());
create policy purchase_order_lines_platform_superadmin_update on public.purchase_order_lines for update to authenticated using (public.is_platform_superadmin()) with check (public.is_platform_superadmin());

revoke all privileges on public.purchase_orders from anon;
revoke all privileges on public.purchase_order_lines from anon;
revoke insert, update, delete, truncate, references, trigger on public.purchase_orders from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.purchase_order_lines from authenticated;
grant select on public.purchase_orders to authenticated;
grant select on public.purchase_order_lines to authenticated;

revoke all on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text) from public, anon;
revoke all on function public.dmp_add_purchase_order_line(uuid, uuid, uuid, numeric, numeric) from public, anon;
revoke all on function public.dmp_update_purchase_order_line(uuid, uuid, uuid, numeric, numeric) from public, anon;
revoke all on function public.dmp_remove_purchase_order_line(uuid) from public, anon;
revoke all on function public.dmp_order_purchase_order(uuid) from public, anon;
revoke all on function public.dmp_cancel_purchase_order(uuid) from public, anon;
grant execute on function public.dmp_create_purchase_order(uuid, uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_update_purchase_order(uuid, uuid, date, uuid, text, text) to authenticated;
grant execute on function public.dmp_add_purchase_order_line(uuid, uuid, uuid, numeric, numeric) to authenticated;
grant execute on function public.dmp_update_purchase_order_line(uuid, uuid, uuid, numeric, numeric) to authenticated;
grant execute on function public.dmp_remove_purchase_order_line(uuid) to authenticated;
grant execute on function public.dmp_order_purchase_order(uuid) to authenticated;
grant execute on function public.dmp_cancel_purchase_order(uuid) to authenticated;

commit;
