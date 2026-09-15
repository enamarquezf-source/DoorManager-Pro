-- DoorManager Pro - supplier invoice payments.
-- Payments are cash outflows recorded separately from supplier invoice obligations.
begin;

alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log add constraint audit_log_operation_check check (operation in (
  'INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE',
  'TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_DRAFT_CREATE',
  'INVOICE_DRAFT_UPDATE','INVOICE_ISSUE','INVOICE_ISSUE_OVERRIDE','PAYMENT_RECORD',
  'PAYMENT_REVERSE','MATERIAL_CREATE','WAREHOUSE_STOCK_RECONCILE','ECONOMIC_REVIEW_APPROVE',
  'ECONOMIC_REVIEW_REOPEN'
));

create table public.supplier_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_invoice_id uuid not null,
  payment_date date not null default current_date,
  amount numeric(12,2) not null,
  payment_method text not null default 'transferencia',
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  constraint supplier_invoice_payments_invoice_company_fk foreign key (company_id, supplier_invoice_id) references public.supplier_invoices(company_id, id),
  constraint supplier_invoice_payments_amount_check check (amount > 0),
  constraint supplier_invoice_payments_method_check check (payment_method in ('transferencia','tarjeta','efectivo','domiciliacion','otro')),
  constraint supplier_invoice_payments_reversal_check check (
    (reversed_at is null and reversed_by is null and reversal_reason is null)
    or (reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason), '') is not null)
  )
);

create index supplier_invoice_payments_invoice_idx on public.supplier_invoice_payments(company_id, supplier_invoice_id, payment_date desc);
create index supplier_invoice_payments_active_invoice_idx on public.supplier_invoice_payments(company_id, supplier_invoice_id) where reversed_at is null;

alter table public.supplier_invoice_payments enable row level security;
revoke all on table public.supplier_invoice_payments from public, anon, authenticated;
grant select on table public.supplier_invoice_payments to authenticated;

create policy supplier_invoice_payments_select_permissions on public.supplier_invoice_payments
  for select to authenticated
  using ((company_id = public.current_company_id() and public.has_permission('supplier_payments.read')) or public.is_platform_superadmin());
create policy supplier_invoice_payments_insert_denied on public.supplier_invoice_payments
  for insert to authenticated with check (false);
create policy supplier_invoice_payments_update_denied on public.supplier_invoice_payments
  for update to authenticated using (false) with check (false);
create policy supplier_invoice_payments_delete_denied on public.supplier_invoice_payments
  for delete to authenticated using (false);

create or replace function public.dmp_record_supplier_payment(
  p_supplier_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_invoice public.supplier_invoices;
  v_paid numeric;
  v_id uuid;
begin
  select * into v_invoice from public.supplier_invoices where id = p_supplier_invoice_id for update;
  if not found then raise exception 'factura proveedor: factura no encontrada'; end if;
  if not (public.is_platform_superadmin() or v_invoice.company_id = public.current_company_id()) then raise exception 'factura proveedor: factura no disponible'; end if;
  if not public.has_permission('supplier_payments.create') and not public.is_platform_superadmin() then raise exception 'permiso: no puedes registrar pagos de proveedor'; end if;
  if v_invoice.status <> 'registered' then raise exception 'pago proveedor: solo se puede pagar una factura registrada'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'pago proveedor: el importe debe ser mayor que cero'; end if;
  if nullif(trim(coalesce(p_payment_method, '')), '') is null or p_payment_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'pago proveedor: método no válido'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.supplier_invoice_payments where company_id = v_invoice.company_id and supplier_invoice_id = v_invoice.id and reversed_at is null;
  if round(v_paid + p_amount, 2) > v_invoice.total_amount then raise exception 'pago proveedor: el importe supera el saldo pendiente'; end if;
  insert into public.supplier_invoice_payments(company_id, supplier_invoice_id, payment_date, amount, payment_method, reference, notes, created_by)
  values(v_invoice.company_id, v_invoice.id, coalesce(p_payment_date, current_date), p_amount, p_payment_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), v_actor.id)
  returning id into v_id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values(v_invoice.company_id, 'supplier_invoice_payments', v_id, 'PAYMENT_RECORD', v_actor.id, null, jsonb_build_object('supplier_invoice_id', v_invoice.id, 'amount', p_amount, 'payment_method', p_payment_method));
  return v_id;
end;
$$;

create or replace function public.dmp_reverse_supplier_payment(p_payment_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_payment public.supplier_invoice_payments;
  v_invoice public.supplier_invoices;
begin
  select * into v_payment from public.supplier_invoice_payments where id = p_payment_id;
  if not found then raise exception 'pago proveedor: pago no encontrado'; end if;
  select * into v_invoice from public.supplier_invoices where id = v_payment.supplier_invoice_id and company_id = v_payment.company_id for update;
  if not found then raise exception 'pago proveedor: factura no encontrada'; end if;
  select * into v_payment from public.supplier_invoice_payments where id = p_payment_id and supplier_invoice_id = v_invoice.id for update;
  if not found or v_payment.reversed_at is not null then raise exception 'pago proveedor: pago no encontrado o ya revertido'; end if;
  if not (public.is_platform_superadmin() or v_invoice.company_id = public.current_company_id()) then raise exception 'pago proveedor: pago no disponible'; end if;
  if not public.has_permission('supplier_payments.reverse') and not public.is_platform_superadmin() then raise exception 'permiso: no puedes revertir pagos de proveedor'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'pago proveedor: el motivo de reversión es obligatorio'; end if;
  update public.supplier_invoice_payments set reversed_at = now(), reversed_by = v_actor.id, reversal_reason = trim(p_reason) where id = v_payment.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values(v_invoice.company_id, 'supplier_invoice_payments', v_payment.id, 'PAYMENT_REVERSE', v_actor.id, to_jsonb(v_payment), jsonb_build_object('reversed_at', now(), 'reversal_reason', trim(p_reason)));
  return v_payment.id;
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
  if exists (select 1 from public.supplier_invoice_payments where company_id = v_invoice.company_id and supplier_invoice_id = v_invoice.id and reversed_at is null) then raise exception 'factura proveedor: primero deben revertirse los pagos activos'; end if;
  perform set_config('dmp.supplier_invoice_lifecycle', 'cancel', true);
  update public.supplier_invoices set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor.id, cancellation_reason = trim(p_reason), updated_by = v_actor.id where id = v_invoice.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_invoice.company_id, 'supplier_invoices', v_invoice.id, 'UPDATE', v_actor.id, to_jsonb(v_invoice), jsonb_build_object('status','cancelled','reason',trim(p_reason),'lifecycle','cancelled'));
  return v_invoice.id;
end;
$$;

insert into public.permissions (code, description) values
  ('supplier_payments.read', 'Consultar pagos de proveedor'),
  ('supplier_payments.create', 'Registrar pagos de proveedor'),
  ('supplier_payments.reverse', 'Revertir pagos de proveedor')
on conflict (code) do update set description = excluded.description;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name in ('superadmin','Gerencia','Oficina') and p.code like 'supplier_payments.%'
on conflict do nothing;

revoke all on function public.dmp_record_supplier_payment(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.dmp_record_supplier_payment(uuid, numeric, date, text, text, text) to authenticated;
revoke all on function public.dmp_reverse_supplier_payment(uuid, text) from public, anon;
grant execute on function public.dmp_reverse_supplier_payment(uuid, text) to authenticated;

commit;
