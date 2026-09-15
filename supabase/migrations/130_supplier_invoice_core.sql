-- DoorManager Pro - supplier invoice core.
-- Supplier invoices are financial obligations only: they never receive stock or create payments.
begin;

alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in (
  'Manual de instalacion','Manual de mantenimiento','Manual de motor','Manual de cuadro',
  'Esquema electrico','Despiece','Declaracion CE','Instrucciones de desbloqueo',
  'Procedimiento interno','Ficha tecnica','Factura proveedor'
));
alter table public.document_links drop constraint if exists document_links_related_type_check;
alter table public.document_links add constraint document_links_related_type_check check (related_type in (
  'Cliente','Centro','Equipo','Tipo de equipo','Marca','Modelo','Motor','Cuadro',
  'Expediente','Parte','Check','Factura proveedor'
));

insert into public.permissions (code, description) values
  ('supplier_invoices.read', 'Consultar facturas de proveedor'),
  ('supplier_invoices.create', 'Crear facturas de proveedor'),
  ('supplier_invoices.update', 'Modificar borradores de proveedor'),
  ('supplier_invoices.register', 'Registrar facturas de proveedor'),
  ('supplier_invoices.cancel', 'Cancelar facturas de proveedor')
on conflict (code) do update set description = excluded.description;
insert into public.app_modules (code, label, sort_order) values
  ('supplier_invoices', 'Facturas de proveedor', 45)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name in ('superadmin','Gerencia','Oficina') and p.code like 'supplier_invoices.%'
on conflict do nothing;

create or replace function public.next_dmp_code(
  p_company_id uuid, p_table_name text, p_prefix text,
  p_yearly boolean default false, p_width integer default 6
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_base text;
  v_sequence integer;
  v_start integer;
begin
  perform public.assert_member_of_current_company(p_company_id);
  if p_table_name <> all(array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes','purchase_orders','purchase_receipts','supplier_invoices']) then
    raise exception 'Tabla no permitida para generar codigo: %', p_table_name;
  end if;
  if nullif(p_prefix, '') is null then raise exception 'Prefijo de codigo obligatorio'; end if;
  v_base := case when p_yearly then p_prefix || '-' || v_year || '-' else p_prefix || '-' end;
  v_start := length(v_base) + 1;
  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':' || p_table_name || ':' || v_base));
  execute format(
    'select coalesce(max(substring(code from $2)::integer), 0) + 1 from public.%I where company_id = $1 and code like $3 and substring(code from $2) ~ ''^[0-9]+$''',
    p_table_name
  ) into v_sequence using p_company_id, v_start, v_base || '%';
  return v_base || lpad(v_sequence::text, greatest(p_width, 1), '0');
end;
$$;
revoke all on function public.next_dmp_code(uuid, text, text, boolean, integer) from public, anon;
grant execute on function public.next_dmp_code(uuid, text, text, boolean, integer) to authenticated;

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  supplier_id uuid not null,
  supplier_invoice_number text,
  invoice_date date not null default current_date,
  due_date date,
  status text not null default 'draft',
  currency_code text not null default 'EUR',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  constraint supplier_invoices_company_code_unique unique (company_id, code),
  constraint supplier_invoices_company_id_id_unique unique (company_id, id),
  constraint supplier_invoices_supplier_company_fk foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  constraint supplier_invoices_status_check check (status in ('draft','registered','cancelled')),
  constraint supplier_invoices_number_check check (status = 'draft' or nullif(trim(supplier_invoice_number), '') is not null),
  constraint supplier_invoices_dates_check check (due_date is null or due_date >= invoice_date)
);

create table public.supplier_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_invoice_id uuid not null,
  description text not null,
  material_id uuid,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  tax_rate numeric(6,2) not null default 21,
  net_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invoice_lines_company_id_id_unique unique (company_id, id),
  constraint supplier_invoice_lines_invoice_company_fk foreign key (company_id, supplier_invoice_id) references public.supplier_invoices(company_id, id) on delete cascade,
  constraint supplier_invoice_lines_material_company_fk foreign key (company_id, material_id) references public.materials(company_id, id),
  constraint supplier_invoice_lines_values_check check (quantity > 0 and unit_price >= 0 and tax_rate >= 0)
);

create table public.supplier_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_invoice_id uuid not null,
  supplier_invoice_line_id uuid not null,
  purchase_order_id uuid,
  purchase_order_line_id uuid,
  purchase_receipt_id uuid,
  purchase_receipt_line_id uuid,
  allocated_quantity numeric(12,2),
  allocated_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  constraint supplier_invoice_allocations_company_id_id_unique unique (company_id, id),
  constraint supplier_invoice_allocations_invoice_company_fk foreign key (company_id, supplier_invoice_id) references public.supplier_invoices(company_id, id) on delete cascade,
  constraint supplier_invoice_allocations_line_company_fk foreign key (company_id, supplier_invoice_line_id) references public.supplier_invoice_lines(company_id, id) on delete cascade,
  constraint supplier_invoice_allocations_order_company_fk foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id),
  constraint supplier_invoice_allocations_order_line_company_fk foreign key (company_id, purchase_order_line_id) references public.purchase_order_lines(company_id, id),
  constraint supplier_invoice_allocations_receipt_company_fk foreign key (company_id, purchase_receipt_id) references public.purchase_receipts(company_id, id),
  constraint supplier_invoice_allocations_receipt_line_company_fk foreign key (company_id, purchase_receipt_line_id) references public.purchase_receipt_lines(company_id, id),
  constraint supplier_invoice_allocations_target_check check (purchase_order_line_id is not null or purchase_receipt_line_id is not null),
  constraint supplier_invoice_allocations_amount_check check (allocated_amount >= 0 and (allocated_quantity is null or allocated_quantity > 0))
);

create index supplier_invoices_supplier_date_idx on public.supplier_invoices(company_id, supplier_id, invoice_date desc);
create index supplier_invoices_supplier_number_idx on public.supplier_invoices(company_id, supplier_id, supplier_invoice_number);
create index supplier_invoices_status_idx on public.supplier_invoices(company_id, status, due_date);
create index supplier_invoice_lines_invoice_idx on public.supplier_invoice_lines(company_id, supplier_invoice_id);
create index supplier_invoice_allocations_invoice_idx on public.supplier_invoice_allocations(company_id, supplier_invoice_id);
create index supplier_invoice_allocations_order_idx on public.supplier_invoice_allocations(company_id, purchase_order_id, purchase_order_line_id);
create index supplier_invoice_allocations_receipt_idx on public.supplier_invoice_allocations(company_id, purchase_receipt_id, purchase_receipt_line_id);
create unique index supplier_invoice_allocations_order_only_unique on public.supplier_invoice_allocations(company_id, supplier_invoice_line_id, purchase_order_line_id) where purchase_order_line_id is not null and purchase_receipt_line_id is null;
create unique index supplier_invoice_allocations_receipt_only_unique on public.supplier_invoice_allocations(company_id, supplier_invoice_line_id, purchase_receipt_line_id) where purchase_order_line_id is null and purchase_receipt_line_id is not null;
create unique index supplier_invoice_allocations_order_receipt_unique on public.supplier_invoice_allocations(company_id, supplier_invoice_line_id, purchase_order_line_id, purchase_receipt_line_id) where purchase_order_line_id is not null and purchase_receipt_line_id is not null;

create or replace function public.dmp_supplier_invoice_recalculate(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.supplier_invoices i set
    subtotal = coalesce((select round(sum(l.net_amount), 2) from public.supplier_invoice_lines l where l.company_id = i.company_id and l.supplier_invoice_id = i.id), 0),
    tax_amount = coalesce((select round(sum(l.tax_amount), 2) from public.supplier_invoice_lines l where l.company_id = i.company_id and l.supplier_invoice_id = i.id), 0),
    total_amount = coalesce((select round(sum(l.total_amount), 2) from public.supplier_invoice_lines l where l.company_id = i.company_id and l.supplier_invoice_id = i.id), 0),
    updated_at = now()
  where i.id = p_invoice_id and i.status = 'draft';
end;
$$;

create or replace function public.dmp_supplier_invoice_line_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice public.supplier_invoices; v_existing_allocated numeric;
begin
  select * into v_invoice from public.supplier_invoices where id = case when tg_op = 'DELETE' then old.supplier_invoice_id else new.supplier_invoice_id end for update;
  if not found or v_invoice.status <> 'draft' then raise exception 'factura proveedor: solo se puede editar un borrador'; end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.supplier_invoice_id is distinct from old.supplier_invoice_id or new.created_at is distinct from old.created_at) then
      raise exception 'factura proveedor: identidad de línea protegida';
    end if;
    if new.company_id is distinct from v_invoice.company_id then raise exception 'factura proveedor: empresa no válida'; end if;
    new.description := nullif(trim(new.description), '');
    if new.description is null then raise exception 'factura proveedor: la descripción es obligatoria'; end if;
    new.net_amount := round(new.quantity * new.unit_price, 2);
    new.tax_amount := round(new.net_amount * new.tax_rate / 100, 2);
    new.total_amount := round(new.net_amount + new.tax_amount, 2);
    if tg_op = 'UPDATE' then
      select coalesce(sum(allocated_amount), 0) into v_existing_allocated
      from public.supplier_invoice_allocations
      where company_id = old.company_id and supplier_invoice_line_id = old.id;
      if v_existing_allocated > new.total_amount then
        raise exception 'factura proveedor: el total de la línea no puede ser inferior a las asignaciones existentes';
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;
  return old;
end;
$$;

create or replace function public.dmp_supplier_invoice_line_totals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.dmp_supplier_invoice_recalculate(case when tg_op = 'DELETE' then old.supplier_invoice_id else new.supplier_invoice_id end);
  return null;
end;
$$;

create or replace function public.dmp_supplier_invoice_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.code is distinct from old.code or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
      raise exception 'factura proveedor: identidad protegida';
    end if;
    if old.status = 'draft' and new.status <> 'draft' and coalesce(current_setting('dmp.supplier_invoice_lifecycle', true), '') <> 'register' then raise exception 'factura proveedor: transición no válida'; end if;
    if old.status = 'registered' and (new.status <> 'cancelled' or coalesce(current_setting('dmp.supplier_invoice_lifecycle', true), '') <> 'cancel') then raise exception 'factura proveedor: registrada congelada'; end if;
    if old.status = 'draft' and new.status = 'registered' and coalesce(current_setting('dmp.supplier_invoice_lifecycle', true), '') <> 'register' then raise exception 'factura proveedor: el registro solo puede realizarse mediante RPC'; end if;
    if old.status = 'cancelled' then raise exception 'factura proveedor: factura cancelada congelada'; end if;
    if old.status = 'registered' and (new.supplier_id is distinct from old.supplier_id or new.supplier_invoice_number is distinct from old.supplier_invoice_number or new.invoice_date is distinct from old.invoice_date or new.due_date is distinct from old.due_date or new.currency_code is distinct from old.currency_code or new.subtotal is distinct from old.subtotal or new.tax_amount is distinct from old.tax_amount or new.total_amount is distinct from old.total_amount or new.notes is distinct from old.notes) then
      raise exception 'factura proveedor: datos financieros congelados';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.dmp_supplier_invoice_allocation_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice public.supplier_invoices; v_invoice_line public.supplier_invoice_lines; v_order public.purchase_orders; v_order_line public.purchase_order_lines; v_receipt public.purchase_receipts; v_receipt_line public.purchase_receipt_lines; v_existing_amount numeric;
begin
  select * into v_invoice from public.supplier_invoices
    where id = case when tg_op = 'UPDATE' or tg_op = 'DELETE' then old.supplier_invoice_id else new.supplier_invoice_id end
      and company_id = case when tg_op = 'UPDATE' or tg_op = 'DELETE' then old.company_id else new.company_id end
    for update;
  if not found or v_invoice.status <> 'draft' then
    if tg_op = 'DELETE' then raise exception 'factura proveedor: solo se pueden eliminar asignaciones de borradores';
    else raise exception 'factura proveedor: solo se asignan borradores'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.supplier_invoice_id is distinct from old.supplier_invoice_id or new.supplier_invoice_line_id is distinct from old.supplier_invoice_line_id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by) then
    raise exception 'factura proveedor: identidad de asignación protegida';
  end if;
  if not exists (select 1 from public.supplier_invoice_lines where id = new.supplier_invoice_line_id and company_id = new.company_id and supplier_invoice_id = new.supplier_invoice_id) then raise exception 'factura proveedor: línea financiera no válida'; end if;
  if new.purchase_order_line_id is not null then
    select * into v_order_line from public.purchase_order_lines where id = new.purchase_order_line_id and company_id = new.company_id;
    if not found then raise exception 'factura proveedor: línea de pedido no válida'; end if;
    select * into v_order from public.purchase_orders where id = v_order_line.purchase_order_id and company_id = new.company_id;
    if not found or v_order.supplier_id <> v_invoice.supplier_id then raise exception 'factura proveedor: el pedido no pertenece al proveedor'; end if;
    if new.purchase_order_id is null then new.purchase_order_id := v_order.id; elsif new.purchase_order_id <> v_order.id then raise exception 'factura proveedor: pedido y línea no coinciden'; end if;
  elsif new.purchase_order_id is not null then raise exception 'factura proveedor: el pedido necesita línea'; end if;
  if new.purchase_receipt_line_id is not null then
    select * into v_receipt_line from public.purchase_receipt_lines where id = new.purchase_receipt_line_id and company_id = new.company_id;
    if not found then raise exception 'factura proveedor: línea de recepción no válida'; end if;
    select * into v_receipt from public.purchase_receipts where id = v_receipt_line.purchase_receipt_id and company_id = new.company_id;
    if not found or v_receipt.supplier_id <> v_invoice.supplier_id or v_receipt.status <> 'confirmed' then raise exception 'factura proveedor: recepción no válida para el proveedor'; end if;
    if new.purchase_receipt_id is null then new.purchase_receipt_id := v_receipt.id; elsif new.purchase_receipt_id <> v_receipt.id then raise exception 'factura proveedor: recepción y línea no coinciden'; end if;
    if new.purchase_order_line_id is null then new.purchase_order_line_id := v_receipt_line.purchase_order_line_id; elsif new.purchase_order_line_id <> v_receipt_line.purchase_order_line_id then raise exception 'factura proveedor: pedido y recepción no coinciden'; end if;
    if new.purchase_order_id is null then new.purchase_order_id := v_receipt.purchase_order_id; elsif new.purchase_order_id <> v_receipt.purchase_order_id then raise exception 'factura proveedor: pedido y recepción no coinciden'; end if;
  elsif new.purchase_receipt_id is not null then raise exception 'factura proveedor: la recepción necesita línea'; end if;
  select * into v_invoice_line from public.supplier_invoice_lines where id = new.supplier_invoice_line_id and company_id = new.company_id and supplier_invoice_id = new.supplier_invoice_id;
  select coalesce(sum(allocated_amount), 0) into v_existing_amount from public.supplier_invoice_allocations where company_id = new.company_id and supplier_invoice_line_id = new.supplier_invoice_line_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if round(v_existing_amount + new.allocated_amount, 2) > v_invoice_line.total_amount then raise exception 'factura proveedor: las asignaciones superan el total de la línea'; end if;
  return new;
end;
$$;

drop trigger if exists supplier_invoice_guard_trigger on public.supplier_invoices;
create trigger supplier_invoice_guard_trigger before update on public.supplier_invoices for each row execute function public.dmp_supplier_invoice_guard();
drop trigger if exists supplier_invoice_line_guard_trigger on public.supplier_invoice_lines;
create trigger supplier_invoice_line_guard_trigger before insert or update or delete on public.supplier_invoice_lines for each row execute function public.dmp_supplier_invoice_line_guard();
drop trigger if exists supplier_invoice_line_totals_trigger on public.supplier_invoice_lines;
create trigger supplier_invoice_line_totals_trigger after insert or update or delete on public.supplier_invoice_lines for each row execute function public.dmp_supplier_invoice_line_totals();
drop trigger if exists supplier_invoice_allocation_guard_trigger on public.supplier_invoice_allocations;
create trigger supplier_invoice_allocation_guard_trigger before insert or update or delete on public.supplier_invoice_allocations for each row execute function public.dmp_supplier_invoice_allocation_guard();

alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_lines enable row level security;
alter table public.supplier_invoice_allocations enable row level security;
revoke all on table public.supplier_invoices, public.supplier_invoice_lines, public.supplier_invoice_allocations from public, anon;
grant select, insert, update on table public.supplier_invoices to authenticated;
grant select, insert, update, delete on table public.supplier_invoice_lines to authenticated;
grant select, insert, delete on table public.supplier_invoice_allocations to authenticated;

create policy supplier_invoices_select_permissions on public.supplier_invoices for select to authenticated using ((company_id = public.current_company_id() and public.has_permission('supplier_invoices.read')) or public.is_platform_superadmin());
create policy supplier_invoices_insert_permissions on public.supplier_invoices for insert to authenticated with check (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.create')) or public.is_platform_superadmin()) and created_by = public.current_profile_id() and updated_by = public.current_profile_id() and status = 'draft');
create policy supplier_invoices_update_permissions on public.supplier_invoices for update to authenticated using (((company_id = public.current_company_id() and status = 'draft' and public.has_permission('supplier_invoices.update')) or (public.is_platform_superadmin() and status = 'draft'))) with check (((company_id = public.current_company_id() and status = 'draft' and public.has_permission('supplier_invoices.update')) or (public.is_platform_superadmin() and status = 'draft')) and updated_by = public.current_profile_id());

create policy supplier_invoice_lines_select_permissions on public.supplier_invoice_lines for select to authenticated using ((company_id = public.current_company_id() and public.has_permission('supplier_invoices.read')) or public.is_platform_superadmin());
create policy supplier_invoice_lines_insert_permissions on public.supplier_invoice_lines for insert to authenticated with check (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.update')) or public.is_platform_superadmin()) and exists (select 1 from public.supplier_invoices i where i.company_id = supplier_invoice_lines.company_id and i.id = supplier_invoice_lines.supplier_invoice_id and i.status = 'draft'));
create policy supplier_invoice_lines_update_permissions on public.supplier_invoice_lines for update to authenticated using (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.update')) or public.is_platform_superadmin()) and exists (select 1 from public.supplier_invoices i where i.company_id = supplier_invoice_lines.company_id and i.id = supplier_invoice_lines.supplier_invoice_id and i.status = 'draft')) with check (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.update')) or public.is_platform_superadmin()) and exists (select 1 from public.supplier_invoices i where i.company_id = supplier_invoice_lines.company_id and i.id = supplier_invoice_lines.supplier_invoice_id and i.status = 'draft'));
create policy supplier_invoice_lines_delete_permissions on public.supplier_invoice_lines for delete to authenticated using (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.update')) or public.is_platform_superadmin()) and exists (select 1 from public.supplier_invoices i where i.company_id = supplier_invoice_lines.company_id and i.id = supplier_invoice_lines.supplier_invoice_id and i.status = 'draft'));

create policy supplier_invoice_allocations_select_permissions on public.supplier_invoice_allocations for select to authenticated using ((company_id = public.current_company_id() and public.has_permission('supplier_invoices.read')) or public.is_platform_superadmin());
create policy supplier_invoice_allocations_insert_permissions on public.supplier_invoice_allocations for insert to authenticated with check (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.update')) or public.is_platform_superadmin()) and created_by = public.current_profile_id() and exists (select 1 from public.supplier_invoices i where i.company_id = supplier_invoice_allocations.company_id and i.id = supplier_invoice_allocations.supplier_invoice_id and i.status = 'draft'));
create policy supplier_invoice_allocations_delete_permissions on public.supplier_invoice_allocations for delete to authenticated using (((company_id = public.current_company_id() and public.has_permission('supplier_invoices.update')) or public.is_platform_superadmin()) and exists (select 1 from public.supplier_invoices i where i.company_id = supplier_invoice_allocations.company_id and i.id = supplier_invoice_allocations.supplier_invoice_id and i.status = 'draft'));

create or replace function public.dmp_register_supplier_invoice(p_supplier_invoice_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invoice public.supplier_invoices; v_actor public.profiles := public.dmp024_active_profile(); v_line_count integer; v_subtotal numeric; v_tax numeric; v_total numeric;
begin
  if not (public.has_permission('supplier_invoices.register') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes registrar facturas de proveedor'; end if;
  select * into v_invoice from public.supplier_invoices where id = p_supplier_invoice_id for update;
  if not found or (not public.is_platform_superadmin() and v_invoice.company_id <> public.current_company_id()) then raise exception 'factura proveedor: registro no disponible'; end if;
  if v_invoice.status <> 'draft' then raise exception 'factura proveedor: solo se puede registrar un borrador'; end if;
  if nullif(trim(v_invoice.supplier_invoice_number), '') is null then raise exception 'factura proveedor: el número del proveedor es obligatorio'; end if;
  if not exists (select 1 from public.suppliers where company_id = v_invoice.company_id and id = v_invoice.supplier_id) then raise exception 'factura proveedor: proveedor no válido'; end if;
  select count(*), round(coalesce(sum(net_amount), 0), 2), round(coalesce(sum(tax_amount), 0), 2), round(coalesce(sum(total_amount), 0), 2) into v_line_count, v_subtotal, v_tax, v_total from public.supplier_invoice_lines where company_id = v_invoice.company_id and supplier_invoice_id = v_invoice.id;
  if v_line_count = 0 then raise exception 'factura proveedor: añade al menos una línea'; end if;
  if v_total <= 0 or v_subtotal < 0 or v_tax < 0 then raise exception 'factura proveedor: los importes no son válidos'; end if;
  perform set_config('dmp.supplier_invoice_lifecycle', 'register', true);
  update public.supplier_invoices set status = 'registered', subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total, updated_by = v_actor.id where id = v_invoice.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_invoice.company_id, 'supplier_invoices', v_invoice.id, 'UPDATE', v_actor.id, to_jsonb(v_invoice), jsonb_build_object('status','registered','subtotal',v_subtotal,'tax_amount',v_tax,'total_amount',v_total,'lifecycle','registered'));
  return v_invoice.id;
end;
$$;

create or replace function public.dmp_cancel_supplier_invoice(p_supplier_invoice_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invoice public.supplier_invoices; v_actor public.profiles := public.dmp024_active_profile();
begin
  if not (public.has_permission('supplier_invoices.cancel') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes cancelar facturas de proveedor'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'factura proveedor: el motivo de cancelación es obligatorio'; end if;
  select * into v_invoice from public.supplier_invoices where id = p_supplier_invoice_id for update;
  if not found or (not public.is_platform_superadmin() and v_invoice.company_id <> public.current_company_id()) then raise exception 'factura proveedor: registro no disponible'; end if;
  if v_invoice.status <> 'registered' then raise exception 'factura proveedor: solo se puede cancelar una factura registrada'; end if;
  perform set_config('dmp.supplier_invoice_lifecycle', 'cancel', true);
  update public.supplier_invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor.id, cancellation_reason = trim(p_reason), updated_by = v_actor.id where id = v_invoice.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_invoice.company_id, 'supplier_invoices', v_invoice.id, 'UPDATE', v_actor.id, to_jsonb(v_invoice), jsonb_build_object('status','cancelled','reason',trim(p_reason),'lifecycle','cancelled'));
  return v_invoice.id;
end;
$$;

revoke all on function public.dmp_supplier_invoice_recalculate(uuid) from public, anon, authenticated;
revoke all on function public.dmp_supplier_invoice_guard() from public, anon, authenticated;
revoke all on function public.dmp_supplier_invoice_line_guard() from public, anon, authenticated;
revoke all on function public.dmp_supplier_invoice_line_totals() from public, anon, authenticated;
revoke all on function public.dmp_supplier_invoice_allocation_guard() from public, anon, authenticated;
revoke all on function public.dmp_register_supplier_invoice(uuid) from public, anon;
revoke all on function public.dmp_cancel_supplier_invoice(uuid, text) from public, anon;
grant execute on function public.dmp_register_supplier_invoice(uuid) to authenticated;
grant execute on function public.dmp_cancel_supplier_invoice(uuid, text) to authenticated;

commit;
