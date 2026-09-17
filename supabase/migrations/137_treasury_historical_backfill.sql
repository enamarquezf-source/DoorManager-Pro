-- DoorManager Pro - explicit historical payment backfill and opening balance cut-off.
begin;

create or replace view public.treasury_account_balances with (security_invoker = true) as
select a.company_id, a.id as treasury_account_id, a.name, a.account_type, a.currency_code, a.active,
       a.iban, a.opening_balance, a.opening_balance_date,
       round(a.opening_balance + coalesce(sum(case when t.direction = 'inflow' then t.amount else -t.amount end)
         filter (where t.reversed_at is null and t.transaction_date >= a.opening_balance_date), 0), 2) as balance
from public.treasury_accounts a left join public.treasury_transactions t
  on t.company_id = a.company_id and t.treasury_account_id = a.id
group by a.company_id, a.id, a.name, a.account_type, a.currency_code, a.active, a.iban, a.opening_balance, a.opening_balance_date;

create or replace function public.dmp_preview_treasury_historical_backfill(p_treasury_account_id uuid)
returns table(
  treasury_account_id uuid,
  currency_code text,
  customer_pending bigint,
  customer_pending_total numeric,
  supplier_pending bigint,
  supplier_pending_total numeric,
  historical_before_opening_count bigint,
  balance_affecting_count bigint,
  currency_conflict_count bigint,
  earliest_transaction_date date,
  latest_transaction_date date
)
language plpgsql security definer set search_path = public
as $$
declare
  v_account public.treasury_accounts;
begin
  if not (public.has_permission('treasury.read') or public.is_platform_superadmin()) then
    raise exception 'permiso: no puedes consultar la regularización histórica';
  end if;
  select * into v_account
  from public.treasury_accounts
  where id = p_treasury_account_id
    and company_id = public.current_company_id()
    and active;
  if not found then raise exception 'tesorería: cuenta no disponible para la empresa'; end if;
  return query
  with candidates as (
    select p.paid_at as transaction_date, p.amount, 'customer'::text as payment_kind, (v_account.currency_code = 'EUR') as currency_ok
    from public.invoice_payments p
    join public.invoices i on i.id = p.invoice_id and i.company_id = p.company_id
    where p.company_id = v_account.company_id
      and p.reversed_at is null
      and not exists (select 1 from public.treasury_transactions t where t.company_id = p.company_id and t.source_type = 'customer_payment' and t.source_id = p.id)
    union all
    select p.payment_date, p.amount, 'supplier'::text, (i.currency_code = v_account.currency_code)
    from public.supplier_invoice_payments p
    join public.supplier_invoices i on i.id = p.supplier_invoice_id and i.company_id = p.company_id
    where p.company_id = v_account.company_id
      and p.reversed_at is null
      and not exists (select 1 from public.treasury_transactions t where t.company_id = p.company_id and t.source_type = 'supplier_payment' and t.source_id = p.id)
  )
  select v_account.id,
    v_account.currency_code,
    count(*) filter (where payment_kind = 'customer' and currency_ok),
    coalesce(sum(amount) filter (where payment_kind = 'customer' and currency_ok), 0),
    count(*) filter (where payment_kind = 'supplier' and currency_ok),
    coalesce(sum(amount) filter (where payment_kind = 'supplier' and currency_ok), 0),
    count(*) filter (where transaction_date < v_account.opening_balance_date and currency_ok),
    count(*) filter (where transaction_date >= v_account.opening_balance_date and currency_ok),
    count(*) filter (where not currency_ok),
    min(transaction_date) filter (where currency_ok),
    max(transaction_date) filter (where currency_ok)
  from candidates;
end;
$$;

create or replace function public.dmp_apply_treasury_historical_backfill(p_treasury_account_id uuid)
returns table(
  customer_inserted bigint,
  supplier_inserted bigint,
  customer_skipped bigint,
  supplier_skipped bigint,
  historical_before_opening_count bigint,
  balance_affecting_count bigint
)
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_account public.treasury_accounts;
  v_customer record;
  v_supplier record;
  v_transaction_id uuid;
  v_customer_inserted bigint := 0;
  v_supplier_inserted bigint := 0;
  v_customer_skipped bigint := 0;
  v_supplier_skipped bigint := 0;
  v_historical bigint := 0;
  v_balance_affecting bigint := 0;
begin
  if not (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin()) then
    raise exception 'permiso: no puedes aplicar la regularización histórica';
  end if;
  if not (public.has_permission('billing.write') or public.is_platform_superadmin()) then
    raise exception 'permiso: necesitas permisos de cobros para regularizar históricos';
  end if;
  if not (public.has_permission('supplier_payments.create') or public.is_platform_superadmin()) then
    raise exception 'permiso: necesitas permisos de pagos de proveedor para regularizar históricos';
  end if;
  select * into v_account
  from public.treasury_accounts
  where id = p_treasury_account_id
    and company_id = public.current_company_id()
    and active
  for update;
  if not found then raise exception 'tesorería: cuenta no disponible para la empresa'; end if;
  perform pg_advisory_xact_lock(hashtextextended('treasury_historical_backfill:' || v_account.company_id::text, 0));

  for v_customer in
    select p.id, p.company_id, p.amount, p.paid_at, p.method, p.reference, p.notes
    from public.invoice_payments p
    join public.invoices i on i.id = p.invoice_id and i.company_id = p.company_id
    where p.company_id = v_account.company_id
      and p.reversed_at is null
      and v_account.currency_code = 'EUR'
      and not exists (select 1 from public.treasury_transactions t where t.company_id = p.company_id and t.source_type = 'customer_payment' and t.source_id = p.id)
    order by p.id
    for update of p
  loop
    v_transaction_id := public.dmp_treasury_insert(v_account.company_id, v_account.id, 'inflow', v_customer.amount, v_customer.paid_at, v_account.currency_code, 'payment', 'customer_payment', v_customer.id, null, v_customer.method, v_customer.reference, 'Regularización histórica de cobro cliente' || coalesce(' - ' || nullif(trim(v_customer.notes), ''), ''), v_actor.id);
    insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, new_data)
    values (v_account.company_id, 'treasury_transactions', v_transaction_id, 'PAYMENT_RECORD', v_actor.id, jsonb_build_object('treasury_operation', 'historical_backfill', 'source_type', 'customer_payment', 'source_id', v_customer.id));
    v_customer_inserted := v_customer_inserted + 1;
    if v_customer.paid_at < v_account.opening_balance_date then v_historical := v_historical + 1; else v_balance_affecting := v_balance_affecting + 1; end if;
  end loop;
  select count(*) into v_customer_skipped
  from public.invoice_payments p
  join public.invoices i on i.id = p.invoice_id and i.company_id = p.company_id
  where p.company_id = v_account.company_id
    and p.reversed_at is null
    and v_account.currency_code = 'EUR'
    and exists (select 1 from public.treasury_transactions t where t.company_id = p.company_id and t.source_type = 'customer_payment' and t.source_id = p.id);

  for v_supplier in
    select p.id, p.company_id, p.amount, p.payment_date, p.payment_method, p.reference, p.notes, i.currency_code
    from public.supplier_invoice_payments p
    join public.supplier_invoices i on i.id = p.supplier_invoice_id and i.company_id = p.company_id
    where p.company_id = v_account.company_id
      and p.reversed_at is null
      and i.currency_code = v_account.currency_code
      and not exists (select 1 from public.treasury_transactions t where t.company_id = p.company_id and t.source_type = 'supplier_payment' and t.source_id = p.id)
    order by p.id
    for update of p
  loop
    v_transaction_id := public.dmp_treasury_insert(v_account.company_id, v_account.id, 'outflow', v_supplier.amount, v_supplier.payment_date, v_account.currency_code, 'payment', 'supplier_payment', v_supplier.id, null, v_supplier.payment_method, v_supplier.reference, 'Regularización histórica de pago proveedor' || coalesce(' - ' || nullif(trim(v_supplier.notes), ''), ''), v_actor.id);
    insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, new_data)
    values (v_account.company_id, 'treasury_transactions', v_transaction_id, 'PAYMENT_RECORD', v_actor.id, jsonb_build_object('treasury_operation', 'historical_backfill', 'source_type', 'supplier_payment', 'source_id', v_supplier.id));
    v_supplier_inserted := v_supplier_inserted + 1;
    if v_supplier.payment_date < v_account.opening_balance_date then v_historical := v_historical + 1; else v_balance_affecting := v_balance_affecting + 1; end if;
  end loop;
  select count(*) into v_supplier_skipped
  from public.supplier_invoice_payments p
  join public.supplier_invoices i on i.id = p.supplier_invoice_id and i.company_id = p.company_id
  where p.company_id = v_account.company_id
    and p.reversed_at is null
    and i.currency_code = v_account.currency_code
    and exists (select 1 from public.treasury_transactions t where t.company_id = p.company_id and t.source_type = 'supplier_payment' and t.source_id = p.id);

  return query select v_customer_inserted, v_supplier_inserted, v_customer_skipped, v_supplier_skipped, v_historical, v_balance_affecting;
end;
$$;

revoke all on function public.dmp_preview_treasury_historical_backfill(uuid) from public, anon;
grant execute on function public.dmp_preview_treasury_historical_backfill(uuid) to authenticated;
revoke all on function public.dmp_apply_treasury_historical_backfill(uuid) from public, anon;
grant execute on function public.dmp_apply_treasury_historical_backfill(uuid) to authenticated;

commit;
