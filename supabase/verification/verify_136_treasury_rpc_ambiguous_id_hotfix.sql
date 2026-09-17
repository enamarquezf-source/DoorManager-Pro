-- Read-only verification for migration 136.
-- It intentionally returns exactly one result set and performs no writes.
with function_oids as (
  select
    to_regprocedure('public.dmp_create_treasury_account(text,text,text,text,numeric,date,text)') as create_account_oid,
    to_regprocedure('public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text,uuid)') as customer_payment_oid,
    to_regprocedure('public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text,uuid)') as supplier_payment_oid,
    to_regprocedure('public.dmp_record_treasury_manual_movement(uuid,text,numeric,date,text,text,text)') as manual_movement_oid,
    to_regprocedure('public.dmp_transfer_treasury(uuid,uuid,numeric,date,text,text)') as transfer_oid
), function_defs as (
  select
    coalesce(pg_get_functiondef(create_account_oid::oid), '') as create_account_def,
    coalesce(pg_get_functiondef(customer_payment_oid::oid), '') as customer_payment_def,
    coalesce(pg_get_functiondef(supplier_payment_oid::oid), '') as supplier_payment_def,
    coalesce(pg_get_functiondef(manual_movement_oid::oid), '') as manual_movement_def,
    coalesce(pg_get_functiondef(transfer_oid::oid), '') as transfer_def
  from function_oids
), checks as (
  select 'exact function signatures' as check_name,
    (select create_account_oid is not null and customer_payment_oid is not null and supplier_payment_oid is not null and manual_movement_oid is not null and transfer_oid is not null from function_oids) as passed,
    'all corrected RPC signatures resolve exactly' as detail
  union all select 'security definer and fixed search path',
    (select bool_and(p.prosecdef and array_position(p.proconfig, 'search_path=public') is not null)
     from pg_proc p, function_oids o
     where p.oid in (o.create_account_oid, o.customer_payment_oid, o.supplier_payment_oid, o.manual_movement_oid, o.transfer_oid)),
    'all corrected RPCs are SECURITY DEFINER with search_path=public'
  union all select 'create account identifier is qualified',
    (select create_account_def from function_defs) ilike '%returning treasury_accounts.id into v_id%'
      and (select create_account_def from function_defs) ilike '%treasury_accounts%,v_id%'
      and (select create_account_def from function_defs) ilike '%return v_id%',
    'account id is captured and reused through v_id'
  union all select 'customer payment identifier is qualified',
    (select customer_payment_def from function_defs) ilike '%returning invoice_payments.id into v_payment_id%'
      and (select customer_payment_def from function_defs) ilike '%customer_payment'',v_payment_id%'
      and (select customer_payment_def from function_defs) ilike '%return v_payment_id%',
    'customer payment id is captured and reused through v_payment_id'
  union all select 'supplier payment identifier is qualified',
    (select supplier_payment_def from function_defs) ilike '%returning supplier_invoice_payments.id into v_payment_id%'
      and (select supplier_payment_def from function_defs) ilike '%supplier_payment'',v_payment_id%'
      and (select supplier_payment_def from function_defs) ilike '%return v_payment_id%',
    'supplier payment id is captured and reused through v_payment_id'
  union all select 'manual and transfer identifiers are unambiguous',
    (select manual_movement_def from function_defs) not ilike '% id uuid%'
      and (select manual_movement_def from function_defs) ilike '%v_transaction_id%'
      and (select transfer_def from function_defs) not ilike '% id uuid%'
      and (select transfer_def from function_defs) ilike '%v_transaction_id%',
    'additional affected treasury functions no longer use local id'
  union all select 'no ambiguous returning or id assignment remains',
    (select create_account_def || customer_payment_def || supplier_payment_def || manual_movement_def || transfer_def from function_defs) not ilike '%returning id into id%'
      and (select create_account_def || customer_payment_def || supplier_payment_def || manual_movement_def || transfer_def from function_defs) not ilike '%declare% id uuid%',
    'corrected definitions contain no local id collision pattern'
  union all select 'customer payment treasury contract',
    (select customer_payment_def from function_defs) ilike '%insert into public.invoice_payments%'
      and (select customer_payment_def from function_defs) ilike '%dmp_treasury_insert%'
      and (select customer_payment_def from function_defs) ilike '%inflow%'
      and (select customer_payment_def from function_defs) ilike '%customer_payment%'
      and (select customer_payment_def from function_defs) ilike '%source_id'',v_payment_id%',
    'invoice payment and treasury inflow use the payment id'
  union all select 'supplier payment treasury contract',
    (select supplier_payment_def from function_defs) ilike '%insert into public.supplier_invoice_payments%'
      and (select supplier_payment_def from function_defs) ilike '%dmp_treasury_insert%'
      and (select supplier_payment_def from function_defs) ilike '%outflow%'
      and (select supplier_payment_def from function_defs) ilike '%supplier_payment%'
      and (select supplier_payment_def from function_defs) ilike '%source_id'',v_payment_id%',
    'supplier payment and treasury outflow use the payment id'
  union all select 'manual movement treasury contract',
    (select manual_movement_def from function_defs) ilike '%dmp_treasury_insert%'
      and (select manual_movement_def from function_defs) ilike '%''manual''%'
      and (select manual_movement_def from function_defs) ilike '%v_transaction_id%'
      and (select manual_movement_def from function_defs) ilike '%treasury_operation'',''manual%'
      and (select manual_movement_def from function_defs) ilike '%return v_transaction_id%',
    'manual movement uses the canonical insert, manual source, audit and transaction id'
  union all select 'treasury transfer contract',
    (select transfer_def from function_defs) ilike '%if p_from_account_id < p_to_account_id%'
      and (select transfer_def from function_defs) ilike '%for update%'
      and (select transfer_def from function_defs) ilike '%f.id=t.id%'
      and (select transfer_def from function_defs) ilike '%f.currency_code<>t.currency_code%'
      and (select transfer_def from function_defs) ilike '%p_amount<=0%'
      and (select transfer_def from function_defs) ilike '%''outflow''%'
      and (select transfer_def from function_defs) ilike '%''inflow''%'
      and (select transfer_def from function_defs) ilike '%''outflow''%null,g%'
      and (select transfer_def from function_defs) ilike '%''inflow''%null,g%'
      and (select transfer_def from function_defs) ilike '%v_transaction_id%'
      and (select transfer_def from function_defs) ilike '%transfer_group_id'',g%'
      and (select transfer_def from function_defs) ilike '%treasury_operation'',''transfer%'
      and (select transfer_def from function_defs) ilike '%return g%',
    'transfer locks both accounts, validates balances and creates paired treasury legs'
  union all select 'authenticated execute and public/anon denied',
    has_function_privilege('authenticated', 'public.dmp_create_treasury_account(text,text,text,text,numeric,date,text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text,uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text,uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_record_treasury_manual_movement(uuid,text,numeric,date,text,text,text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_transfer_treasury(uuid,uuid,numeric,date,text,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_create_treasury_account(text,text,text,text,numeric,date,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text,uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text,uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_record_treasury_manual_movement(uuid,text,numeric,date,text,text,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_transfer_treasury(uuid,uuid,numeric,date,text,text)', 'EXECUTE')
      and not exists (select 1 from pg_proc p, function_oids o, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid in (o.create_account_oid, o.customer_payment_oid, o.supplier_payment_oid, o.manual_movement_oid, o.transfer_oid) and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'all five current RPCs are authenticated-only'
  union all select 'legacy payment RPCs remain revoked',
    not has_function_privilege('authenticated', 'public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.dmp_record_supplier_payment(uuid,numeric,date,text,text,text)', 'EXECUTE'),
    'six-argument legacy payment overloads remain closed'
), result as (
  select check_name, passed, detail, 0 as sort_order from checks
  union all
  select 'SUMMARY', bool_and(passed), case when bool_and(passed) then 'PASS' else 'FAIL' end, 1 from checks
)
select check_name, passed, detail
from result
order by sort_order, check_name;
