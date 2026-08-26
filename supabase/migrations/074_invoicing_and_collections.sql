-- DoorManager Pro - real invoice and collection lifecycle for validated work orders.

begin;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  client_id uuid not null references public.clients(id),
  status text not null default 'emitida' check(status in('emitida','parcialmente_cobrada','cobrada','cancelada')),
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0 check(subtotal>=0),
  tax_rate numeric(6,2) not null default 21 check(tax_rate>=0),
  tax_amount numeric(12,2) not null default 0 check(tax_amount>=0),
  total_amount numeric(12,2) not null default 0 check(total_amount>=0),
  paid_amount numeric(12,2) not null default 0 check(paid_amount>=0),
  notes text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  constraint invoices_company_code_unique unique(company_id,code)
);

create table if not exists public.invoice_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  invoice_id uuid not null references public.invoices(id),
  work_order_id uuid not null references public.work_orders(id),
  description text not null,
  subtotal numeric(12,2) not null check(subtotal>=0),
  tax_rate numeric(6,2) not null check(tax_rate>=0),
  tax_amount numeric(12,2) not null check(tax_amount>=0),
  total_amount numeric(12,2) not null check(total_amount>=0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists invoice_work_orders_active_work_unique on public.invoice_work_orders(work_order_id) where deleted_at is null;
create index if not exists invoice_work_orders_invoice_idx on public.invoice_work_orders(company_id,invoice_id) where deleted_at is null;

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  invoice_id uuid not null references public.invoices(id),
  amount numeric(12,2) not null check(amount>0),
  paid_at date not null default current_date,
  method text not null default 'transferencia' check(method in('transferencia','tarjeta','efectivo','domiciliacion','otro')),
  reference text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text
);

create index if not exists invoice_payments_invoice_idx on public.invoice_payments(company_id,invoice_id) where reversed_at is null;

alter table public.invoices enable row level security;
alter table public.invoice_work_orders enable row level security;
alter table public.invoice_payments enable row level security;

drop policy if exists invoices_select_economic_roles on public.invoices;
create policy invoices_select_economic_roles on public.invoices for select to authenticated using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina','Comercial','SAT']));
drop policy if exists invoice_work_orders_select_economic_roles on public.invoice_work_orders;
create policy invoice_work_orders_select_economic_roles on public.invoice_work_orders for select to authenticated using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina','Comercial','SAT']));
drop policy if exists invoice_payments_select_economic_roles on public.invoice_payments;
create policy invoice_payments_select_economic_roles on public.invoice_payments for select to authenticated using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina','Comercial','SAT']));

drop policy if exists invoices_direct_insert_denied on public.invoices;
create policy invoices_direct_insert_denied on public.invoices for insert to authenticated with check(false);
drop policy if exists invoices_direct_update_denied on public.invoices;
create policy invoices_direct_update_denied on public.invoices for update to authenticated using(false);
drop policy if exists invoices_direct_delete_denied on public.invoices;
create policy invoices_direct_delete_denied on public.invoices for delete to authenticated using(false);
drop policy if exists invoice_work_orders_direct_insert_denied on public.invoice_work_orders;
create policy invoice_work_orders_direct_insert_denied on public.invoice_work_orders for insert to authenticated with check(false);
drop policy if exists invoice_work_orders_direct_update_denied on public.invoice_work_orders;
create policy invoice_work_orders_direct_update_denied on public.invoice_work_orders for update to authenticated using(false);
drop policy if exists invoice_work_orders_direct_delete_denied on public.invoice_work_orders;
create policy invoice_work_orders_direct_delete_denied on public.invoice_work_orders for delete to authenticated using(false);
drop policy if exists invoice_payments_direct_insert_denied on public.invoice_payments;
create policy invoice_payments_direct_insert_denied on public.invoice_payments for insert to authenticated with check(false);
drop policy if exists invoice_payments_direct_update_denied on public.invoice_payments;
create policy invoice_payments_direct_update_denied on public.invoice_payments for update to authenticated using(false);
drop policy if exists invoice_payments_direct_delete_denied on public.invoice_payments;
create policy invoice_payments_direct_delete_denied on public.invoice_payments for delete to authenticated using(false);

create or replace function public.dmp_refresh_invoice_collection(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_invoice public.invoices; v_paid numeric; v_paid_net numeric;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  select round(coalesce(sum(amount),0),2) into v_paid from public.invoice_payments where invoice_id=v_invoice.id and reversed_at is null;
  if v_paid>v_invoice.total_amount then raise exception 'cobro: el total cobrado supera el importe de la factura'; end if;
  update public.invoices set paid_amount=v_paid,status=case when status='cancelada' then status when v_paid>=total_amount and total_amount>0 then 'cobrada' when v_paid>0 then 'parcialmente_cobrada' else 'emitida' end,updated_at=now() where id=v_invoice.id returning * into v_invoice;
  v_paid_net:=case when v_invoice.total_amount>0 then round(least(v_invoice.subtotal,v_paid/v_invoice.total_amount*v_invoice.subtotal),2) else 0 end;
  update public.work_orders w set paid_amount=v_paid_net,economic_status=case when v_invoice.status='cobrada' then 'cobrado' else 'facturado' end,updated_at=now()
  from public.invoice_work_orders l where l.invoice_id=v_invoice.id and l.work_order_id=w.id and l.deleted_at is null;
end $$;

revoke all on function public.dmp_refresh_invoice_collection(uuid) from public,anon,authenticated;

create or replace function public.dmp_create_invoice_from_work_order(p_work_order_id uuid,p_tax_rate numeric default 21,p_due_date date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_id uuid; v_code text; v_base text; v_next integer; v_tax numeric; v_total numeric;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para emitir facturas'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.office_validation_status<>'validated' or v_work.economic_status<>'pendiente_facturar' then raise exception 'factura: el parte debe estar validado por oficina y pendiente de facturar'; end if;
  if coalesce(v_work.sale_amount,0)<=0 then raise exception 'factura: el parte no tiene venta facturable'; end if;
  if exists(select 1 from public.invoice_work_orders where work_order_id=v_work.id and deleted_at is null) then raise exception 'factura: el parte ya pertenece a una factura activa'; end if;
  if coalesce(p_tax_rate,0)<0 then raise exception 'factura: IVA no valido'; end if;
  v_base:='FAC-'||to_char(current_date,'YYYY')||'-';
  perform pg_advisory_xact_lock(hashtextextended(v_work.company_id::text||':invoice:'||v_base,0));
  select coalesce(max(substring(code from length(v_base)+1)::integer),0)+1 into v_next from public.invoices where company_id=v_work.company_id and code like v_base||'%' and substring(code from length(v_base)+1)~'^[0-9]+$';
  v_code:=v_base||lpad(v_next::text,6,'0'); v_tax:=round(v_work.sale_amount*coalesce(p_tax_rate,0)/100,2); v_total:=round(v_work.sale_amount+v_tax,2);
  insert into public.invoices(company_id,code,client_id,status,issue_date,due_date,subtotal,tax_rate,tax_amount,total_amount,notes,created_by,updated_by)
  values(v_work.company_id,v_code,v_work.client_id,'emitida',current_date,p_due_date,v_work.sale_amount,coalesce(p_tax_rate,0),v_tax,v_total,nullif(trim(p_notes),''),v_actor.id,v_actor.id) returning id into v_id;
  insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,subtotal,tax_rate,tax_amount,total_amount)
  values(v_work.company_id,v_id,v_work.id,v_work.code||' · '||v_work.title,v_work.sale_amount,coalesce(p_tax_rate,0),v_tax,v_total);
  update public.work_orders set invoiced_amount=sale_amount,paid_amount=0,economic_status='facturado',updated_by=v_actor.id,updated_at=now() where id=v_work.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'invoices',v_id,'INVOICE_ISSUE',v_actor.id,null,jsonb_build_object('code',v_code,'work_order_id',v_work.id,'subtotal',v_work.sale_amount,'tax',v_tax,'total',v_total));
  return v_id;
end $$;

create or replace function public.dmp_record_invoice_payment(p_invoice_id uuid,p_amount numeric,p_paid_at date,p_method text,p_reference text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_invoice public.invoices; v_id uuid; v_current numeric;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para registrar cobros'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status='cancelada' then raise exception 'factura: factura no valida para cobro'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if coalesce(p_amount,0)<=0 then raise exception 'cobro: el importe debe ser mayor que cero'; end if;
  if p_method not in('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'cobro: metodo no valido'; end if;
  select coalesce(sum(amount),0) into v_current from public.invoice_payments where invoice_id=v_invoice.id and reversed_at is null;
  if round(v_current+p_amount,2)>v_invoice.total_amount then raise exception 'cobro: el importe supera el saldo pendiente'; end if;
  insert into public.invoice_payments(company_id,invoice_id,amount,paid_at,method,reference,notes,created_by) values(v_invoice.company_id,v_invoice.id,p_amount,coalesce(p_paid_at,current_date),p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),v_actor.id) returning id into v_id;
  perform public.dmp_refresh_invoice_collection(v_invoice.id);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_invoice.company_id,'invoice_payments',v_id,'PAYMENT_RECORD',v_actor.id,null,jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method));
  return v_id;
end $$;

create or replace function public.dmp_reverse_invoice_payment(p_payment_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_payment public.invoice_payments;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para anular cobros'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'cobro: el motivo de anulacion es obligatorio'; end if;
  select * into v_payment from public.invoice_payments where id=p_payment_id and reversed_at is null for update;
  if v_payment.id is null then raise exception 'cobro: cobro no encontrado o ya anulado'; end if;
  perform public.assert_member_of_current_company(v_payment.company_id);
  update public.invoice_payments set reversed_at=now(),reversed_by=v_actor.id,reversal_reason=trim(p_reason) where id=v_payment.id;
  perform public.dmp_refresh_invoice_collection(v_payment.invoice_id);
end $$;

create or replace function public.dmp_cancel_invoice(p_invoice_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_invoice public.invoices;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para cancelar facturas'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'factura: el motivo de cancelacion es obligatorio'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status='cancelada' then raise exception 'factura: factura no encontrada o ya cancelada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if exists(select 1 from public.invoice_payments where invoice_id=v_invoice.id and reversed_at is null) then raise exception 'factura: anula primero los cobros registrados'; end if;
  update public.invoices set status='cancelada',cancelled_at=now(),cancelled_by=v_actor.id,cancellation_reason=trim(p_reason),updated_at=now(),updated_by=v_actor.id where id=v_invoice.id;
  update public.work_orders w set invoiced_amount=0,paid_amount=0,economic_status='pendiente_facturar',updated_by=v_actor.id,updated_at=now() from public.invoice_work_orders l where l.invoice_id=v_invoice.id and l.work_order_id=w.id and l.deleted_at is null;
  update public.invoice_work_orders set deleted_at=now() where invoice_id=v_invoice.id and deleted_at is null;
end $$;

revoke all on function public.dmp_create_invoice_from_work_order(uuid,numeric,date,text) from public,anon;
grant execute on function public.dmp_create_invoice_from_work_order(uuid,numeric,date,text) to authenticated;
revoke all on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text) to authenticated;
revoke all on function public.dmp_reverse_invoice_payment(uuid,text) from public,anon;
grant execute on function public.dmp_reverse_invoice_payment(uuid,text) to authenticated;
revoke all on function public.dmp_cancel_invoice(uuid,text) from public,anon;
grant execute on function public.dmp_cancel_invoice(uuid,text) to authenticated;

revoke all on table public.invoices,public.invoice_work_orders,public.invoice_payments from public,anon;
grant select on table public.invoices,public.invoice_work_orders,public.invoice_payments to authenticated;

commit;
