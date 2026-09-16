-- DoorManager Pro - TREASURY-CORE-023.
-- Treasury rows are reversible in place; balances are always derived.
begin;

create table public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null,
  account_type text not null default 'bank',
  iban text,
  currency_code text not null default 'EUR',
  opening_balance numeric(12,2) not null default 0,
  opening_balance_date date not null default current_date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint treasury_accounts_company_id_id_unique unique (company_id, id),
  constraint treasury_accounts_name_unique unique (company_id, name),
  constraint treasury_accounts_type_check check (account_type in ('cash','bank')),
  constraint treasury_accounts_currency_check check (currency_code ~ '^[A-Z]{3}$')
);

create table public.treasury_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  treasury_account_id uuid not null,
  transaction_date date not null default current_date,
  direction text not null,
  amount numeric(12,2) not null,
  currency_code text not null,
  concept text not null,
  source_type text not null,
  source_id uuid,
  transfer_group_id uuid,
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  constraint treasury_transactions_company_id_id_unique unique (company_id, id),
  constraint treasury_transactions_account_fk foreign key (company_id, treasury_account_id) references public.treasury_accounts(company_id, id),
  constraint treasury_transactions_direction_check check (direction in ('inflow','outflow')),
  constraint treasury_transactions_amount_check check (amount > 0),
  constraint treasury_transactions_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint treasury_transactions_source_type_check check (source_type in ('customer_payment','supplier_payment','manual','transfer')),
  constraint treasury_transactions_source_link_check check ((source_type = 'manual' and source_id is null and transfer_group_id is null) or (source_type = 'transfer' and source_id is null and transfer_group_id is not null) or (source_type in ('customer_payment','supplier_payment') and source_id is not null and transfer_group_id is null)),
  constraint treasury_transactions_reversal_check check ((reversed_at is null and reversed_by is null and reversal_reason is null) or (reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason),'') is not null))
);

create unique index treasury_transactions_source_unique on public.treasury_transactions(company_id, source_type, source_id) where source_id is not null;
create index treasury_transactions_account_date_idx on public.treasury_transactions(company_id, treasury_account_id, transaction_date desc, created_at desc);
create index treasury_transactions_transfer_idx on public.treasury_transactions(company_id, transfer_group_id) where transfer_group_id is not null;

create or replace view public.treasury_account_balances with (security_invoker = true) as
select a.company_id, a.id as treasury_account_id, a.name, a.account_type, a.currency_code, a.active,
       a.iban, a.opening_balance, a.opening_balance_date,
       round(a.opening_balance + coalesce(sum(case when t.direction = 'inflow' then t.amount else -t.amount end) filter (where t.reversed_at is null), 0), 2) as balance
from public.treasury_accounts a left join public.treasury_transactions t
  on t.company_id = a.company_id and t.treasury_account_id = a.id
 group by a.company_id, a.id, a.name, a.account_type, a.currency_code, a.active, a.opening_balance, a.opening_balance_date;

create or replace view public.treasury_transaction_balances with (security_invoker = true) as
select t.*, case when t.direction = 'inflow' then t.amount else -t.amount end as signed_amount
from public.treasury_transactions t where t.reversed_at is null;

alter table public.treasury_accounts enable row level security;
alter table public.treasury_transactions enable row level security;
revoke all on table public.treasury_accounts, public.treasury_transactions from public, anon, authenticated;
grant select on table public.treasury_accounts, public.treasury_transactions to authenticated;
revoke all on public.treasury_account_balances, public.treasury_transaction_balances from public, anon;
grant select on public.treasury_account_balances, public.treasury_transaction_balances to authenticated;

drop policy if exists treasury_accounts_select_permissions on public.treasury_accounts;
create policy treasury_accounts_select_permissions on public.treasury_accounts for select to authenticated using ((company_id = public.current_company_id() and public.has_permission('treasury.read')) or public.is_platform_superadmin());
drop policy if exists treasury_accounts_direct_write_denied on public.treasury_accounts;
create policy treasury_accounts_direct_write_denied on public.treasury_accounts for all to authenticated using (false) with check (false);
drop policy if exists treasury_transactions_select_permissions on public.treasury_transactions;
create policy treasury_transactions_select_permissions on public.treasury_transactions for select to authenticated using ((company_id = public.current_company_id() and public.has_permission('treasury.read')) or public.is_platform_superadmin());
drop policy if exists treasury_transactions_direct_write_denied on public.treasury_transactions;
create policy treasury_transactions_direct_write_denied on public.treasury_transactions for all to authenticated using (false) with check (false);

insert into public.permissions(code, description) values
 ('treasury.read','Consultar tesorería'),('treasury.accounts.create','Crear cuentas de tesorería'),
 ('treasury.accounts.update','Modificar cuentas de tesorería'),('treasury.transactions.create','Crear movimientos de tesorería'),
 ('treasury.transactions.reverse','Revertir movimientos de tesorería'),('treasury.transfers.create','Transferir entre cuentas de tesorería')
on conflict (code) do update set description = excluded.description;
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name in ('superadmin','Gerencia','Oficina') and p.code in ('treasury.read','treasury.accounts.create','treasury.accounts.update','treasury.transactions.create','treasury.transactions.reverse','treasury.transfers.create')
on conflict do nothing;

create or replace function public.dmp_treasury_insert(
  p_company_id uuid, p_account_id uuid, p_direction text, p_amount numeric, p_date date,
  p_currency text, p_type text, p_source_type text, p_source_id uuid, p_transfer_group uuid,
  p_method text, p_reference text, p_notes text, p_actor uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_account public.treasury_accounts; v_id uuid;
begin
  select * into v_account from public.treasury_accounts where company_id=p_company_id and id=p_account_id for update;
  if not found or not v_account.active then raise exception 'tesorería: la cuenta no existe o está inactiva'; end if;
  if v_account.currency_code <> p_currency then raise exception 'tesorería: moneda de cuenta incompatible'; end if;
  if p_amount is null or p_amount <= 0 or p_direction not in ('inflow','outflow') then raise exception 'tesorería: movimiento no válido'; end if;
  insert into public.treasury_transactions(company_id,treasury_account_id,transaction_date,direction,amount,currency_code,concept,source_type,source_id,transfer_group_id,method,reference,notes,created_by)
  values(p_company_id,p_account_id,coalesce(p_date,current_date),p_direction,round(p_amount,2),p_currency,nullif(trim(p_type),''),p_source_type,p_source_id,p_transfer_group,nullif(trim(p_method),''),nullif(trim(p_reference),''),nullif(trim(p_notes),''),p_actor)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.dmp_create_treasury_account(p_name text,p_account_type text,p_iban text,p_currency_code text,p_opening_balance numeric,p_opening_balance_date date,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); id uuid;
begin
  if not (public.has_permission('treasury.accounts.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes crear cuentas de tesorería'; end if;
  if nullif(trim(p_name),'') is null or p_account_type not in ('cash','bank') or coalesce(p_currency_code,'EUR') !~ '^[A-Z]{3}$' then raise exception 'tesorería: datos de cuenta no válidos'; end if;
  insert into public.treasury_accounts(company_id,name,account_type,iban,currency_code,opening_balance,opening_balance_date,notes,created_by,updated_by) values(public.current_company_id(),trim(p_name),p_account_type,nullif(trim(p_iban),''),coalesce(p_currency_code,'EUR'),coalesce(p_opening_balance,0),coalesce(p_opening_balance_date,current_date),nullif(trim(p_notes),''),a.id,a.id) returning id into id;
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(public.current_company_id(),'treasury_accounts',id,'INSERT',a.id,jsonb_build_object('treasury_operation','account_create','name',trim(p_name),'account_type',p_account_type,'iban',nullif(trim(p_iban),''),'opening_balance',coalesce(p_opening_balance,0),'opening_balance_date',coalesce(p_opening_balance_date,current_date),'currency_code',coalesce(p_currency_code,'EUR')));
  return id;
end; $$;

create or replace function public.dmp_update_treasury_account(p_account_id uuid,p_name text,p_account_type text,p_iban text,p_active boolean,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); ac public.treasury_accounts;
begin
  if not (public.has_permission('treasury.accounts.update') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes modificar cuentas de tesorería'; end if;
  select * into ac from public.treasury_accounts where id=p_account_id and company_id=public.current_company_id() for update;
  if not found or nullif(trim(p_name),'') is null or p_account_type not in ('cash','bank') then raise exception 'tesorería: cuenta no válida'; end if;
  update public.treasury_accounts set name=trim(p_name),account_type=p_account_type,iban=nullif(trim(p_iban),''),active=coalesce(p_active,active),notes=nullif(trim(p_notes),''),updated_at=now(),updated_by=a.id where id=ac.id;
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(ac.company_id,'treasury_accounts',ac.id,'UPDATE',a.id,to_jsonb(ac),jsonb_build_object('treasury_operation','account_update','name',trim(p_name),'account_type',p_account_type,'iban',nullif(trim(p_iban),''),'active',coalesce(p_active,ac.active)));
  return ac.id;
end; $$;

create or replace function public.dmp_get_treasury_balances()
returns table(treasury_account_id uuid,name text,account_type text,currency_code text,active boolean,balance numeric)
language sql security definer set search_path=public as $$
  select treasury_account_id,name,account_type,currency_code,active,balance
  from public.treasury_account_balances
  where company_id=public.current_company_id()
    and (public.has_permission('treasury.read') or public.is_platform_superadmin())
  order by name
$$;

create or replace function public.dmp_treasury_period_summary(p_from date, p_to date)
returns table(currency_code text, inflows numeric, outflows numeric)
language sql security definer set search_path=public as $$
  select t.currency_code,
    round(coalesce(sum(t.amount) filter (where t.direction = 'inflow'), 0), 2),
    round(coalesce(sum(t.amount) filter (where t.direction = 'outflow'), 0), 2)
  from public.treasury_transactions t
  where t.company_id = public.current_company_id()
    and t.reversed_at is null
    and t.transaction_date between coalesce(p_from, current_date) and coalesce(p_to, current_date)
    and (public.has_permission('treasury.read') or public.is_platform_superadmin())
  group by t.currency_code
  order by t.currency_code;
$$;

create or replace function public.dmp_treasury_reverse(p_transaction_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.treasury_transactions; v_actor public.profiles := public.dmp024_active_profile(); v_id uuid;
begin
  if not (public.has_permission('treasury.transactions.reverse') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes revertir movimientos'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'tesorería: el motivo de reversión es obligatorio'; end if;
  select * into v from public.treasury_transactions where id=p_transaction_id and company_id=public.current_company_id() for update;
  if not found then raise exception 'tesorería: movimiento no disponible'; end if;
  if v.source_type <> 'manual' then raise exception 'tesorería: solo se pueden revertir movimientos manuales'; end if;
  if v.reversed_at is not null then raise exception 'tesorería: movimiento ya revertido'; end if;
  update public.treasury_transactions set reversed_at=now(),reversed_by=v_actor.id,reversal_reason=trim(p_reason) where id=v.id;
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(v.company_id,'treasury_transactions',v.id,'PAYMENT_REVERSE',v_actor.id,jsonb_build_object('treasury_operation','manual_reverse','reason',trim(p_reason)));
  return v.id;
end; $$;

create or replace function public.dmp_record_invoice_payment(p_invoice_id uuid,p_amount numeric,p_paid_at date,p_method text,p_reference text,p_notes text,p_treasury_account_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.invoices; a public.profiles:=public.dmp024_active_profile(); id uuid; tx uuid; cur text := 'EUR'; paid numeric;
begin
  if not ((public.has_permission('billing.write') or public.is_platform_superadmin()) and (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin())) then raise exception 'permiso: no puedes registrar cobros'; end if;
  select * into v from public.invoices where id=p_invoice_id for update;
  if not found or v.status in ('borrador','cancelada') then raise exception 'factura: factura no válida para cobro'; end if;
  perform public.assert_member_of_current_company(v.company_id);
  if coalesce(p_amount,0)<=0 or nullif(trim(p_method),'') is null or p_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'cobro: datos no válidos'; end if;
  select coalesce(sum(amount),0) into paid from public.invoice_payments where invoice_id=v.id and reversed_at is null;
  if round(paid+p_amount,2)>v.total_amount then raise exception 'cobro: el importe supera el saldo pendiente'; end if;
   insert into public.invoice_payments(company_id,invoice_id,amount,paid_at,method,reference,notes,created_by) values(v.company_id,v.id,p_amount,coalesce(p_paid_at,current_date),p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),a.id) returning id into id;
   tx := public.dmp_treasury_insert(v.company_id,p_treasury_account_id,'inflow',p_amount,coalesce(p_paid_at,current_date),cur,'payment','customer_payment',id,null,p_method,p_reference,p_notes,a.id);
   perform public.dmp_refresh_invoice_collection(v.id);
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v.company_id,'invoice_payments',id,'PAYMENT_RECORD',a.id,null,jsonb_build_object('invoice_id',v.id,'amount',p_amount,'method',p_method));
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(v.company_id,'treasury_transactions',tx,'PAYMENT_RECORD',a.id,jsonb_build_object('treasury_operation','customer_payment','source_id',id));
  return id;
end; $$;

create or replace function public.dmp_record_supplier_payment(p_supplier_invoice_id uuid,p_amount numeric,p_payment_date date,p_payment_method text,p_reference text,p_notes text,p_treasury_account_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.supplier_invoices; a public.profiles:=public.dmp024_active_profile(); id uuid; tx uuid; paid numeric;
begin
  if not (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin()) or not (public.has_permission('supplier_payments.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes registrar pagos de proveedor'; end if;
  select * into v from public.supplier_invoices where id=p_supplier_invoice_id for update;
  if not found or v.status <> 'registered' then raise exception 'pago proveedor: factura no válida'; end if;
  perform public.assert_member_of_current_company(v.company_id);
  if coalesce(p_amount,0)<=0 or nullif(trim(p_payment_method),'') is null or p_payment_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'pago proveedor: datos no válidos'; end if;
  select coalesce(sum(amount),0) into paid from public.supplier_invoice_payments where supplier_invoice_id=v.id and reversed_at is null;
  if round(paid+p_amount,2)>v.total_amount then raise exception 'pago proveedor: el importe supera el saldo pendiente'; end if;
   insert into public.supplier_invoice_payments(company_id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_by) values(v.company_id,v.id,coalesce(p_payment_date,current_date),p_amount,p_payment_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),a.id) returning id into id;
   tx := public.dmp_treasury_insert(v.company_id,p_treasury_account_id,'outflow',p_amount,coalesce(p_payment_date,current_date),v.currency_code,'payment','supplier_payment',id,null,p_payment_method,p_reference,p_notes,a.id);
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v.company_id,'supplier_invoice_payments',id,'PAYMENT_RECORD',a.id,null,jsonb_build_object('supplier_invoice_id',v.id,'amount',p_amount,'payment_method',p_payment_method));
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(v.company_id,'treasury_transactions',tx,'PAYMENT_RECORD',a.id,jsonb_build_object('treasury_operation','supplier_payment','source_id',id));
  return id;
end; $$;

create or replace function public.dmp_record_treasury_manual_movement(p_account_id uuid,p_direction text,p_amount numeric,p_date date,p_method text,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); ac public.treasury_accounts; id uuid;
begin
  if not (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes crear movimientos'; end if;
  if nullif(trim(p_notes),'') is null then raise exception 'tesorería: el concepto manual es obligatorio'; end if;
  select * into ac from public.treasury_accounts where id=p_account_id and company_id=public.current_company_id();
  if not found then raise exception 'tesorería: cuenta no disponible'; end if;
  id:=public.dmp_treasury_insert(ac.company_id,ac.id,p_direction,p_amount,p_date,ac.currency_code,p_notes,'manual',null,null,p_method,p_reference,p_notes,a.id);
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(ac.company_id,'treasury_transactions',id,'INSERT',a.id,jsonb_build_object('treasury_operation','manual','concept',p_notes));
  return id;
end; $$;

create or replace function public.dmp_transfer_treasury(p_from_account_id uuid,p_to_account_id uuid,p_amount numeric,p_date date,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); f public.treasury_accounts; t public.treasury_accounts; g uuid:=gen_random_uuid(); id uuid;
begin
  if not (public.has_permission('treasury.transfers.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes transferir fondos'; end if;
  if p_from_account_id < p_to_account_id then
    select * into f from public.treasury_accounts where id=p_from_account_id and company_id=public.current_company_id() for update;
    select * into t from public.treasury_accounts where id=p_to_account_id and company_id=public.current_company_id() for update;
  else
    select * into t from public.treasury_accounts where id=p_to_account_id and company_id=public.current_company_id() for update;
    select * into f from public.treasury_accounts where id=p_from_account_id and company_id=public.current_company_id() for update;
  end if;
  if f.id is null or t.id is null or not f.active or not t.active or f.id=t.id then raise exception 'tesorería: cuentas de transferencia no válidas'; end if;
  if f.currency_code<>t.currency_code or p_amount<=0 then raise exception 'tesorería: moneda o importe no válido'; end if;
  perform public.dmp_treasury_insert(f.company_id,f.id,'outflow',p_amount,p_date,f.currency_code,'transfer','transfer',null,g,'transfer',p_reference,p_notes,a.id);
  id:=public.dmp_treasury_insert(t.company_id,t.id,'inflow',p_amount,p_date,t.currency_code,'transfer','transfer',null,g,'transfer',p_reference,p_notes,a.id);
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(f.company_id,'treasury_transactions',id,'INSERT',a.id,jsonb_build_object('treasury_operation','transfer','transfer_group_id',g,'from_account',f.id,'to_account',t.id,'amount',p_amount));
  return g;
end; $$;

create or replace function public.dmp_reverse_treasury_transfer(p_transfer_group_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare r record; first_id uuid; leg_count integer:=0; valid_legs boolean:=true;
begin
  if not (public.has_permission('treasury.transactions.reverse') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes revertir transferencias'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'tesorería: el motivo de reversión es obligatorio'; end if;
  for r in select * from public.treasury_transactions where company_id=public.current_company_id() and transfer_group_id=p_transfer_group_id order by id for update loop
    leg_count:=leg_count+1;
    if first_id is null then first_id:=r.id; end if;
    if r.source_type <> 'transfer' or r.transfer_group_id <> p_transfer_group_id or r.reversed_at is not null then valid_legs:=false; end if;
  end loop;
  if leg_count <> 2 or not valid_legs or first_id is null then raise exception 'tesorería: transferencia no encontrada o ya revertida'; end if;
  update public.treasury_transactions set reversed_at=now(),reversed_by=public.current_profile_id(),reversal_reason=trim(p_reason)
    where company_id=public.current_company_id() and transfer_group_id=p_transfer_group_id and source_type='transfer';
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data)
     values(public.current_company_id(),'treasury_transactions',first_id,'PAYMENT_REVERSE',public.current_profile_id(),jsonb_build_object('treasury_operation','transfer_reverse','transfer_group_id',p_transfer_group_id,'reason',trim(p_reason)));
  return first_id;
end; $$;

create or replace function public.dmp_reverse_invoice_payment(p_payment_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare p public.invoice_payments; i public.invoices; a public.profiles:=public.dmp024_active_profile(); t public.treasury_transactions;
begin
  if not ((public.has_permission('billing.write') or public.is_platform_superadmin()) and (public.has_permission('treasury.transactions.reverse') or public.is_platform_superadmin())) then raise exception 'permiso: no puedes revertir cobros'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'cobro: el motivo de anulación es obligatorio'; end if;
  select * into p from public.invoice_payments where id=p_payment_id;
  if not found then raise exception 'cobro: cobro no encontrado o ya anulado'; end if;
  select * into i from public.invoices where id=p.invoice_id for update;
  if not found then raise exception 'factura: factura no encontrada'; end if; perform public.assert_member_of_current_company(i.company_id);
  select * into p from public.invoice_payments where id=p_payment_id and invoice_id=i.id and reversed_at is null for update;
  if not found then raise exception 'cobro: cobro no encontrado o ya anulado'; end if;
   update public.invoice_payments set reversed_at=now(),reversed_by=a.id,reversal_reason=trim(p_reason) where id=p.id;
   select * into t from public.treasury_transactions where company_id=i.company_id and source_type='customer_payment' and source_id=p.id for update;
   if found then update public.treasury_transactions set reversed_at=now(),reversed_by=a.id,reversal_reason=trim(p_reason) where id=t.id and reversed_at is null; end if;
   insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(i.company_id,'invoice_payments',p.id,'PAYMENT_REVERSE',a.id,to_jsonb(p),jsonb_build_object('reversed_at',now(),'reversal_reason',trim(p_reason)));
   perform public.dmp_refresh_invoice_collection(p.invoice_id);
end; $$;

create or replace function public.dmp_reverse_supplier_payment(p_payment_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare p public.supplier_invoice_payments; i public.supplier_invoices; a public.profiles:=public.dmp024_active_profile(); t public.treasury_transactions;
begin
  if not (public.has_permission('treasury.transactions.reverse') or public.is_platform_superadmin()) or not (public.has_permission('supplier_payments.reverse') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes revertir pagos'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'pago proveedor: el motivo de reversión es obligatorio'; end if;
  select * into p from public.supplier_invoice_payments where id=p_payment_id;
  if not found then raise exception 'pago proveedor: pago no encontrado o ya revertido'; end if;
  select * into i from public.supplier_invoices where id=p.supplier_invoice_id for update;
  if not found then raise exception 'factura proveedor: factura no encontrada'; end if; perform public.assert_member_of_current_company(i.company_id);
  select * into p from public.supplier_invoice_payments where id=p_payment_id and supplier_invoice_id=i.id and reversed_at is null for update;
  if not found then raise exception 'pago proveedor: pago no encontrado o ya revertido'; end if;
  update public.supplier_invoice_payments set reversed_at=now(),reversed_by=a.id,reversal_reason=trim(p_reason) where id=p.id;
  select * into t from public.treasury_transactions where company_id=i.company_id and source_type='supplier_payment' and source_id=p.id for update;
  if found then update public.treasury_transactions set reversed_at=now(),reversed_by=a.id,reversal_reason=trim(p_reason) where id=t.id and reversed_at is null; end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(i.company_id,'supplier_invoice_payments',p.id,'PAYMENT_REVERSE',a.id,to_jsonb(p),jsonb_build_object('reversed_at',now(),'reversal_reason',trim(p_reason)));
  return p.id;
end; $$;

revoke all on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text) from public,anon,authenticated;
revoke all on function public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text) from public,anon,authenticated;
revoke all on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text,uuid) from public,anon;
revoke all on function public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text,uuid) from public,anon;
revoke all on function public.dmp_reverse_invoice_payment(uuid,text) from public,anon;
revoke all on function public.dmp_reverse_supplier_payment(uuid,text) from public,anon;
revoke all on function public.dmp_treasury_insert(uuid,uuid,text,numeric,date,text,text,text,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.dmp_treasury_reverse(uuid,text) from public,anon;
grant execute on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text,uuid) to authenticated;
grant execute on function public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text,uuid) to authenticated;
grant execute on function public.dmp_reverse_invoice_payment(uuid,text) to authenticated;
grant execute on function public.dmp_reverse_supplier_payment(uuid,text) to authenticated;
grant execute on function public.dmp_record_treasury_manual_movement(uuid,text,numeric,date,text,text,text) to authenticated;
grant execute on function public.dmp_transfer_treasury(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.dmp_treasury_reverse(uuid,text) to authenticated;
grant execute on function public.dmp_reverse_treasury_transfer(uuid,text) to authenticated;
grant execute on function public.dmp_create_treasury_account(text,text,text,text,numeric,date,text) to authenticated;
grant execute on function public.dmp_update_treasury_account(uuid,text,text,text,boolean,text) to authenticated;
grant execute on function public.dmp_get_treasury_balances() to authenticated;
grant execute on function public.dmp_treasury_period_summary(date,date) to authenticated;

revoke all on function public.dmp_record_treasury_manual_movement(uuid,text,numeric,date,text,text,text), public.dmp_transfer_treasury(uuid,uuid,numeric,date,text,text), public.dmp_reverse_treasury_transfer(uuid,text), public.dmp_create_treasury_account(text,text,text,text,numeric,date,text), public.dmp_update_treasury_account(uuid,text,text,text,boolean,text), public.dmp_get_treasury_balances(), public.dmp_treasury_period_summary(date,date) from public,anon;

commit;
