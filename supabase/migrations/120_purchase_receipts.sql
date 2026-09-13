-- DoorManager Pro - purchase receipts, partial receiving and stock traceability.
begin;

do $$
declare
  v_company_attnum smallint;
  v_id_attnum smallint;
  v_constraint oid;
begin
  select a.attnum into v_company_attnum
  from pg_attribute a
  join pg_class r on r.oid = a.attrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname = 'purchase_order_lines'
    and a.attname = 'company_id' and not a.attisdropped;
  select a.attnum into v_id_attnum
  from pg_attribute a
  join pg_class r on r.oid = a.attrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname = 'purchase_order_lines'
    and a.attname = 'id' and not a.attisdropped;
  select c.oid into v_constraint
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname = 'purchase_order_lines'
    and c.conname = 'purchase_order_lines_company_id_id_unique';
  if v_company_attnum is null or v_id_attnum is null then
    raise exception '120 precondition failed: purchase_order_lines key columns missing';
  end if;
  if v_constraint is not null then
    if not exists (
      select 1 from pg_constraint c
      where c.oid = v_constraint and c.contype = 'u'
        and c.conkey = array[v_company_attnum, v_id_attnum]::smallint[]
    ) then
      raise exception '120 precondition failed: purchase_order_lines candidate key name is incompatible';
    end if;
  else
    alter table public.purchase_order_lines
      add constraint purchase_order_lines_company_id_id_unique
      unique(company_id, id);
  end if;
end $$;

alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft','ordered','partially_received','received','cancelled'));

alter table public.stock_movements add column if not exists purchase_order_id uuid;
alter table public.stock_movements add column if not exists purchase_order_line_id uuid;
alter table public.stock_movements add column if not exists purchase_receipt_id uuid;
alter table public.stock_movements add column if not exists purchase_receipt_line_id uuid;
alter table public.stock_movements add column if not exists unit_cost numeric(12,2);
alter table public.stock_movements add column if not exists source text;
alter table public.stock_movements add column if not exists source_reference text;

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_order_id uuid not null,
  code text not null,
  receipt_date date not null default current_date,
  warehouse_id uuid not null,
  supplier_id uuid not null,
  supplier_document_reference text,
  notes text,
  status text not null default 'draft',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint purchase_receipts_company_code_unique unique (company_id, code),
  constraint purchase_receipts_company_id_id_unique unique (company_id, id),
  constraint purchase_receipts_order_company_fk foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id),
  constraint purchase_receipts_warehouse_company_fk foreign key (company_id, warehouse_id) references public.warehouses(company_id, id),
  constraint purchase_receipts_supplier_company_fk foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  constraint purchase_receipts_status_check check (status in ('draft','confirmed','cancelled'))
);

create table public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_receipt_id uuid not null,
  purchase_order_line_id uuid not null,
  material_id uuid not null,
  description_snapshot text not null,
  unit_snapshot text not null,
  supplier_reference_snapshot text,
  received_quantity numeric(12,2) not null,
  actual_unit_cost numeric(12,2),
  subtotal numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_receipt_lines_company_id_id_unique unique (company_id, id),
  constraint purchase_receipt_lines_receipt_company_fk foreign key (company_id, purchase_receipt_id) references public.purchase_receipts(company_id, id) on delete cascade,
  constraint purchase_receipt_lines_order_line_company_fk foreign key (company_id, purchase_order_line_id) references public.purchase_order_lines(company_id, id),
  constraint purchase_receipt_lines_material_company_fk foreign key (company_id, material_id) references public.materials(company_id, id),
  constraint purchase_receipt_lines_one_order_line_per_receipt unique (company_id, purchase_receipt_id, purchase_order_line_id),
  constraint purchase_receipt_lines_received_quantity_check check (received_quantity > 0),
  constraint purchase_receipt_lines_actual_cost_check check (actual_unit_cost is null or actual_unit_cost >= 0)
);

alter table public.stock_movements
  add constraint stock_movements_purchase_order_company_fk foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id),
  add constraint stock_movements_purchase_order_line_company_fk foreign key (company_id, purchase_order_line_id) references public.purchase_order_lines(company_id, id),
  add constraint stock_movements_purchase_receipt_company_fk foreign key (company_id, purchase_receipt_id) references public.purchase_receipts(company_id, id),
  add constraint stock_movements_purchase_receipt_line_company_fk foreign key (company_id, purchase_receipt_line_id) references public.purchase_receipt_lines(company_id, id),
  add constraint stock_movements_purchase_unit_cost_check check (unit_cost is null or unit_cost >= 0);

create unique index stock_movements_purchase_receipt_line_once
  on public.stock_movements(purchase_receipt_line_id) where purchase_receipt_line_id is not null;
create index purchase_receipts_order_idx on public.purchase_receipts(company_id, purchase_order_id, receipt_date desc);
create index purchase_receipt_lines_receipt_idx on public.purchase_receipt_lines(company_id, purchase_receipt_id);
create index purchase_receipt_lines_order_line_idx on public.purchase_receipt_lines(company_id, purchase_order_line_id);

create or replace function public.dmp_purchase_order_status_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 and new.company_id = old.company_id and new.code = old.code
    and new.supplier_id = old.supplier_id and new.order_date = old.order_date
    and new.destination_warehouse_id is not distinct from old.destination_warehouse_id
    and new.supplier_reference is not distinct from old.supplier_reference
    and new.notes is not distinct from old.notes and new.created_by is not distinct from old.created_by
    and new.created_at = old.created_at and new.status = old.status then return new; end if;
  if new.company_id is distinct from old.company_id or new.code is distinct from old.code
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
    or new.subtotal is distinct from old.subtotal or new.total_amount is distinct from old.total_amount then
    raise exception 'pedido de compra: campos canónicos protegidos';
  end if;
  if old.status = 'draft' and new.status not in ('draft','ordered','cancelled') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status = 'ordered' and new.status not in ('ordered','partially_received','received','cancelled') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status = 'partially_received' and new.status not in ('partially_received','received') then raise exception 'pedido de compra: transición de estado no válida'; end if;
  if old.status in ('received','cancelled') and new.status is distinct from old.status then raise exception 'pedido de compra: el pedido está congelado'; end if;
  if new.status = 'cancelled' and old.status = 'ordered' and exists (select 1 from public.purchase_receipts where purchase_order_id = new.id and status = 'confirmed') then raise exception 'pedido de compra: no se puede cancelar con recepciones confirmadas'; end if;
  if new.status = 'ordered' and (not exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id) or exists (select 1 from public.purchase_order_lines where purchase_order_id = new.id and unit_purchase_price is null)) then raise exception 'pedido de compra: todas las líneas confirmadas necesitan precio acordado'; end if;
  if old.status <> 'draft' and (new.supplier_id is distinct from old.supplier_id or new.order_date is distinct from old.order_date or new.destination_warehouse_id is distinct from old.destination_warehouse_id or new.supplier_reference is distinct from old.supplier_reference or new.notes is distinct from old.notes) then raise exception 'pedido de compra: solo el borrador es editable'; end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end; $$;

create or replace function public.dmp_purchase_receipt_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'recepción: solo se puede eliminar un borrador'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then raise exception 'recepción: la recepción confirmada está bloqueada'; end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.purchase_order_id is distinct from old.purchase_order_id or new.supplier_id is distinct from old.supplier_id or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at) then raise exception 'recepción: identidad y pedido son inmutables'; end if;
  if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.dmp_purchase_receipt_line_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_receipt public.purchase_receipts; v_order public.purchase_orders; v_order_line public.purchase_order_lines; v_received numeric;
begin
  select * into v_receipt from public.purchase_receipts where id = case when tg_op = 'DELETE' then old.purchase_receipt_id else new.purchase_receipt_id end;
  if not found or v_receipt.status <> 'draft' then raise exception 'recepción: las líneas solo son editables en borrador'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.purchase_receipt_id is distinct from old.purchase_receipt_id or new.purchase_order_line_id is distinct from old.purchase_order_line_id) then raise exception 'recepción: identidad de línea inmutable'; end if;
  select * into v_order_line from public.purchase_order_lines where id = new.purchase_order_line_id and company_id = v_receipt.company_id;
  select * into v_order from public.purchase_orders where id = v_order_line.purchase_order_id;
  if not found or v_order_line.purchase_order_id <> v_receipt.purchase_order_id or v_order.status not in ('ordered','partially_received') then raise exception 'recepción: línea no válida para el pedido'; end if;
  select coalesce(sum(prl.received_quantity), 0) into v_received from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id = prl.purchase_receipt_id where prl.purchase_order_line_id = new.purchase_order_line_id and prl.company_id = v_receipt.company_id and pr.status = 'confirmed' and (tg_op <> 'UPDATE' or prl.id <> old.id);
  if v_received + new.received_quantity > v_order_line.ordered_quantity then raise exception 'recepción: la cantidad supera la cantidad pendiente'; end if;
  if new.material_id is distinct from v_order_line.material_id then raise exception 'recepción: material de línea no válido'; end if;
  new.description_snapshot := v_order_line.material_description_snapshot;
  new.unit_snapshot := v_order_line.unit_snapshot;
  new.supplier_reference_snapshot := v_order_line.supplier_reference_snapshot;
  new.subtotal := case when new.actual_unit_cost is null then null else round(new.received_quantity * new.actual_unit_cost, 2) end;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists purchase_order_status_guard_trigger on public.purchase_orders;
create trigger purchase_order_status_guard_trigger before update on public.purchase_orders for each row execute function public.dmp_purchase_order_status_guard();
drop trigger if exists purchase_receipt_guard_trigger on public.purchase_receipts;
create trigger purchase_receipt_guard_trigger before update or delete on public.purchase_receipts for each row execute function public.dmp_purchase_receipt_guard();
drop trigger if exists purchase_receipt_line_guard_trigger on public.purchase_receipt_lines;
create trigger purchase_receipt_line_guard_trigger before insert or update or delete on public.purchase_receipt_lines for each row execute function public.dmp_purchase_receipt_line_guard();

-- Keep the canonical stock boundary, but make an absent warehouse/material balance safe to open.
create or replace function public.dmp_adjust_warehouse_stock(p_warehouse_id uuid, p_material_id uuid, p_movement_type text, p_quantity numeric, p_reason text, p_idempotency_key text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_actor public.profiles := public.dmp024_active_profile(); v_warehouse public.warehouses; v_material public.materials; v_stock public.warehouse_stock; v_existing public.stock_movements; v_new numeric; v_delta numeric; v_company uuid;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para ajustar stock'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if p_movement_type not in ('Entrada','Salida','Devolucion','Ajuste') then raise exception 'validacion del formulario: tipo de movimiento no valido'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into v_warehouse from public.warehouses where id = p_warehouse_id and active and deleted_at is null;
  select * into v_material from public.materials where id = p_material_id and deleted_at is null;
  if v_warehouse.id is null or v_material.id is null or v_warehouse.company_id <> v_material.company_id then raise exception 'stock: almacén/material no válido para la empresa'; end if;
  v_company := v_material.company_id;
  if not public.is_platform_superadmin() and v_company <> public.current_company_id() then raise exception 'empresa: registro no pertenece a la empresa actual'; end if;
  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements where company_id = v_company and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      if v_existing.company_id <> v_company or v_existing.warehouse_id <> p_warehouse_id or v_existing.material_id <> p_material_id or v_existing.movement_type <> p_movement_type or (p_movement_type <> 'Ajuste' and v_existing.quantity <> p_quantity) then raise exception 'conflicto: la clave idempotente ya se usó para otro movimiento de stock'; end if;
      select quantity into v_new from public.warehouse_stock where company_id = v_company and warehouse_id = p_warehouse_id and material_id = p_material_id;
      return v_new;
    end if;
  end if;
  insert into public.warehouse_stock(company_id, warehouse_id, material_id, quantity) values (v_company, p_warehouse_id, p_material_id, 0) on conflict (warehouse_id, material_id) do nothing;
  select * into v_stock from public.warehouse_stock where company_id = v_company and warehouse_id = p_warehouse_id and material_id = p_material_id for update;
  v_delta := case when p_movement_type in ('Entrada','Devolucion') then p_quantity when p_movement_type = 'Ajuste' then p_quantity - v_stock.quantity else -p_quantity end;
  v_new := v_stock.quantity + v_delta;
  if v_new < 0 and not coalesce(v_material.allow_negative_stock, false) then raise exception 'stock: stock insuficiente para %', v_material.code; end if;
  update public.warehouse_stock set quantity = v_new, updated_at = now() where id = v_stock.id;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key) values (v_company, p_warehouse_id, p_material_id, p_movement_type, abs(v_delta), v_actor.id, p_reason, p_idempotency_key);
  return v_new;
end; $$;

create or replace function public.dmp_create_purchase_receipt(p_purchase_order_id uuid, p_receipt_date date, p_warehouse_id uuid, p_supplier_document_reference text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_order public.purchase_orders; v_id uuid; v_company uuid;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
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
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
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
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
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
declare v_line public.purchase_receipt_lines;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 or p_actual_unit_cost is not null and p_actual_unit_cost < 0 then raise exception 'recepción: cantidad/coste no válidos'; end if;
  select * into v_line from public.purchase_receipt_lines where id=p_receipt_line_id;
  if not found or (not public.is_platform_superadmin() and v_line.company_id <> public.current_company_id()) then raise exception 'recepción: línea no disponible'; end if;
  update public.purchase_receipt_lines set received_quantity=p_received_quantity,actual_unit_cost=coalesce(p_actual_unit_cost,actual_unit_cost) where id=p_receipt_line_id;
  return p_receipt_line_id;
end; $$;

create or replace function public.dmp_remove_purchase_receipt_line(p_receipt_line_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes gestionar recepciones'; end if;
  if not exists (select 1 from public.purchase_receipt_lines prl join public.purchase_receipts pr on pr.id=prl.purchase_receipt_id where prl.id=p_receipt_line_id and pr.status='draft' and (public.is_platform_superadmin() or pr.company_id=public.current_company_id())) then raise exception 'recepción: línea no eliminable'; end if;
  delete from public.purchase_receipt_lines where id=p_receipt_line_id;
end; $$;

create or replace function public.dmp_confirm_purchase_receipt(p_receipt_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_receipt public.purchase_receipts; v_order public.purchase_orders; v_line public.purchase_receipt_lines; v_movement public.stock_movements; v_received numeric; v_key text; v_ordered numeric;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes confirmar recepciones'; end if;
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
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no puedes cancelar recepciones'; end if;
  if not exists (select 1 from public.purchase_receipts where id=p_receipt_id and status='draft' and (public.is_platform_superadmin() or company_id=public.current_company_id())) then raise exception 'recepción: solo se puede cancelar un borrador'; end if;
  update public.purchase_receipts set status='cancelled' where id=p_receipt_id;
  return p_receipt_id;
end; $$;

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;
create policy purchase_receipts_select_backoffice on public.purchase_receipts for select to authenticated using (company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy purchase_receipts_platform_superadmin_select on public.purchase_receipts for select to authenticated using (public.is_platform_superadmin());
create policy purchase_receipt_lines_select_backoffice on public.purchase_receipt_lines for select to authenticated using (company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy purchase_receipt_lines_platform_superadmin_select on public.purchase_receipt_lines for select to authenticated using (public.is_platform_superadmin());
revoke all privileges on public.purchase_receipts, public.purchase_receipt_lines from anon;
revoke all privileges on public.purchase_receipts, public.purchase_receipt_lines from authenticated;
grant select on public.purchase_receipts, public.purchase_receipt_lines to authenticated;

revoke all on function public.dmp_create_purchase_receipt(uuid,date,uuid,text,text), public.dmp_update_purchase_receipt(uuid,date,uuid,text,text), public.dmp_add_purchase_receipt_line(uuid,uuid,numeric,numeric), public.dmp_update_purchase_receipt_line(uuid,numeric,numeric), public.dmp_remove_purchase_receipt_line(uuid), public.dmp_confirm_purchase_receipt(uuid), public.dmp_cancel_draft_purchase_receipt(uuid) from public, anon;
grant execute on function public.dmp_create_purchase_receipt(uuid,date,uuid,text,text), public.dmp_update_purchase_receipt(uuid,date,uuid,text,text), public.dmp_add_purchase_receipt_line(uuid,uuid,numeric,numeric), public.dmp_update_purchase_receipt_line(uuid,numeric,numeric), public.dmp_remove_purchase_receipt_line(uuid), public.dmp_confirm_purchase_receipt(uuid), public.dmp_cancel_draft_purchase_receipt(uuid) to authenticated;

commit;
