-- DoorManager Pro - qualify treasury RPC identifiers shadowed by local id variables.
begin;

create or replace function public.dmp_create_treasury_account(p_name text,p_account_type text,p_iban text,p_currency_code text,p_opening_balance numeric,p_opening_balance_date date,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); v_id uuid;
begin
  if not (public.has_permission('treasury.accounts.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes crear cuentas de tesorería'; end if;
  if nullif(trim(p_name),'') is null or p_account_type not in ('cash','bank') or coalesce(p_currency_code,'EUR') !~ '^[A-Z]{3}$' then raise exception 'tesorería: datos de cuenta no válidos'; end if;
  insert into public.treasury_accounts(company_id,name,account_type,iban,currency_code,opening_balance,opening_balance_date,notes,created_by,updated_by) values(public.current_company_id(),trim(p_name),p_account_type,nullif(trim(p_iban),''),coalesce(p_currency_code,'EUR'),coalesce(p_opening_balance,0),coalesce(p_opening_balance_date,current_date),nullif(trim(p_notes),''),a.id,a.id) returning treasury_accounts.id into v_id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(public.current_company_id(),'treasury_accounts',v_id,'INSERT',a.id,jsonb_build_object('treasury_operation','account_create','name',trim(p_name),'account_type',p_account_type,'iban',nullif(trim(p_iban),''),'opening_balance',coalesce(p_opening_balance,0),'opening_balance_date',coalesce(p_opening_balance_date,current_date),'currency_code',coalesce(p_currency_code,'EUR')));
  return v_id;
end; $$;

create or replace function public.dmp_record_invoice_payment(p_invoice_id uuid,p_amount numeric,p_paid_at date,p_method text,p_reference text,p_notes text,p_treasury_account_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.invoices; a public.profiles:=public.dmp024_active_profile(); v_payment_id uuid; tx uuid; cur text := 'EUR'; paid numeric;
begin
  if not ((public.has_permission('billing.write') or public.is_platform_superadmin()) and (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin())) then raise exception 'permiso: no puedes registrar cobros'; end if;
  select * into v from public.invoices where id=p_invoice_id for update;
  if not found or v.status in ('borrador','cancelada') then raise exception 'factura: factura no válida para cobro'; end if;
  perform public.assert_member_of_current_company(v.company_id);
  if coalesce(p_amount,0)<=0 or nullif(trim(p_method),'') is null or p_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'cobro: datos no válidos'; end if;
  select coalesce(sum(amount),0) into paid from public.invoice_payments where invoice_id=v.id and reversed_at is null;
  if round(paid+p_amount,2)>v.total_amount then raise exception 'cobro: el importe supera el saldo pendiente'; end if;
  insert into public.invoice_payments(company_id,invoice_id,amount,paid_at,method,reference,notes,created_by) values(v.company_id,v.id,p_amount,coalesce(p_paid_at,current_date),p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),a.id) returning invoice_payments.id into v_payment_id;
  tx := public.dmp_treasury_insert(v.company_id,p_treasury_account_id,'inflow',p_amount,coalesce(p_paid_at,current_date),cur,'payment','customer_payment',v_payment_id,null,p_method,p_reference,p_notes,a.id);
  perform public.dmp_refresh_invoice_collection(v.id);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v.company_id,'invoice_payments',v_payment_id,'PAYMENT_RECORD',a.id,null,jsonb_build_object('invoice_id',v.id,'amount',p_amount,'method',p_method));
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(v.company_id,'treasury_transactions',tx,'PAYMENT_RECORD',a.id,jsonb_build_object('treasury_operation','customer_payment','source_id',v_payment_id));
  return v_payment_id;
end; $$;

create or replace function public.dmp_record_supplier_payment(p_supplier_invoice_id uuid,p_amount numeric,p_payment_date date,p_payment_method text,p_reference text,p_notes text,p_treasury_account_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.supplier_invoices; a public.profiles:=public.dmp024_active_profile(); v_payment_id uuid; tx uuid; paid numeric;
begin
  if not (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin()) or not (public.has_permission('supplier_payments.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes registrar pagos de proveedor'; end if;
  select * into v from public.supplier_invoices where id=p_supplier_invoice_id for update;
  if not found or v.status <> 'registered' then raise exception 'pago proveedor: factura no válida'; end if;
  perform public.assert_member_of_current_company(v.company_id);
  if coalesce(p_amount,0)<=0 or nullif(trim(p_payment_method),'') is null or p_payment_method not in ('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'pago proveedor: datos no válidos'; end if;
  select coalesce(sum(amount),0) into paid from public.supplier_invoice_payments where supplier_invoice_id=v.id and reversed_at is null;
  if round(paid+p_amount,2)>v.total_amount then raise exception 'pago proveedor: el importe supera el saldo pendiente'; end if;
  insert into public.supplier_invoice_payments(company_id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_by) values(v.company_id,v.id,coalesce(p_payment_date,current_date),p_amount,p_payment_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),a.id) returning supplier_invoice_payments.id into v_payment_id;
  tx := public.dmp_treasury_insert(v.company_id,p_treasury_account_id,'outflow',p_amount,coalesce(p_payment_date,current_date),v.currency_code,'payment','supplier_payment',v_payment_id,null,p_payment_method,p_reference,p_notes,a.id);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v.company_id,'supplier_invoice_payments',v_payment_id,'PAYMENT_RECORD',a.id,null,jsonb_build_object('supplier_invoice_id',v.id,'amount',p_amount,'payment_method',p_payment_method));
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(v.company_id,'treasury_transactions',tx,'PAYMENT_RECORD',a.id,jsonb_build_object('treasury_operation','supplier_payment','source_id',v_payment_id));
  return v_payment_id;
end; $$;

create or replace function public.dmp_record_treasury_manual_movement(p_account_id uuid,p_direction text,p_amount numeric,p_date date,p_method text,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); ac public.treasury_accounts; v_transaction_id uuid;
begin
  if not (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes crear movimientos'; end if;
  if nullif(trim(p_notes),'') is null then raise exception 'tesorería: el concepto manual es obligatorio'; end if;
  select * into ac from public.treasury_accounts where id=p_account_id and company_id=public.current_company_id();
  if not found then raise exception 'tesorería: cuenta no disponible'; end if;
  v_transaction_id:=public.dmp_treasury_insert(ac.company_id,ac.id,p_direction,p_amount,p_date,ac.currency_code,p_notes,'manual',null,null,p_method,p_reference,p_notes,a.id);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(ac.company_id,'treasury_transactions',v_transaction_id,'INSERT',a.id,jsonb_build_object('treasury_operation','manual','concept',p_notes));
  return v_transaction_id;
end; $$;

create or replace function public.dmp_transfer_treasury(p_from_account_id uuid,p_to_account_id uuid,p_amount numeric,p_date date,p_reference text,p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); f public.treasury_accounts; t public.treasury_accounts; g uuid:=gen_random_uuid(); v_transaction_id uuid;
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
  v_transaction_id:=public.dmp_treasury_insert(t.company_id,t.id,'inflow',p_amount,p_date,t.currency_code,'transfer','transfer',null,g,'transfer',p_reference,p_notes,a.id);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(f.company_id,'treasury_transactions',v_transaction_id,'INSERT',a.id,jsonb_build_object('treasury_operation','transfer','transfer_group_id',g,'from_account',f.id,'to_account',t.id,'amount',p_amount));
  return g;
end; $$;

commit;
