-- Read-only verification for migration 137.
-- It intentionally returns exactly one result set and performs no writes.
with function_oids as (
  select
    to_regprocedure('public.dmp_preview_treasury_historical_backfill(uuid)') as preview_oid,
    to_regprocedure('public.dmp_apply_treasury_historical_backfill(uuid)') as apply_oid
), function_defs as (
  select
    coalesce(pg_get_functiondef(preview_oid::oid), '') as preview_def,
    coalesce(pg_get_functiondef(apply_oid::oid), '') as apply_def
  from function_oids
), view_def as (
  select coalesce(pg_get_viewdef(c.oid, true), '') as definition
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'treasury_account_balances' and c.relkind = 'v'
), checks as (
  select 'exact RPC signatures' as check_name,
    (select preview_oid is not null and apply_oid is not null from function_oids) as passed,
    'preview and apply signatures resolve by OID' as detail
  union all select 'opening date controls balance',
    (select definition from view_def) ilike '%opening_balance%'
      and (select definition from view_def) ilike '%transaction_date >=%opening_balance_date%'
      and (select definition from view_def) ilike '%reversed_at is null%',
    'pre-opening active movements are excluded while later ones affect balance'
  union all select 'no current balance column',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'treasury_accounts' and column_name = 'current_balance'),
    'balance remains derived from opening balance and transactions'
  union all select 'real payment schema contract',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'company_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'invoice_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'amount' and data_type = 'numeric')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'paid_at' and data_type = 'date')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'method' and data_type = 'text')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'reference' and data_type = 'text')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'notes' and data_type = 'text')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'reversed_at' and data_type = 'timestamp with time zone')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'company_id' and data_type = 'uuid')
      and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'currency_code')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'company_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'supplier_invoice_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'amount' and data_type = 'numeric')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'payment_date' and data_type = 'date')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'payment_method' and data_type = 'text')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'reference' and data_type = 'text')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'notes' and data_type = 'text')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'reversed_at' and data_type = 'timestamp with time zone')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoices' and column_name = 'company_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoices' and column_name = 'currency_code' and data_type = 'text'),
    'payment columns and the real EUR/customer and supplier currency contracts exist'
  union all select 'payment account linkage contract',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'treasury_account_id')
      and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'supplier_invoice_payments' and column_name = 'treasury_account_id'),
    'payment tables have no treasury_account_id to update or conflict'
  union all select 'opening date schema contract',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'treasury_accounts' and column_name = 'opening_balance_date' and data_type = 'date' and is_nullable = 'NO' and column_default is not null),
    'opening_balance_date is required and has a default'
  union all select 'RPC security and fixed search path',
    exists (select 1 from pg_proc p, function_oids o where p.oid = o.preview_oid and p.prosecdef and array_position(p.proconfig, 'search_path=public') is not null)
      and exists (select 1 from pg_proc p, function_oids o where p.oid = o.apply_oid and p.prosecdef and array_position(p.proconfig, 'search_path=public') is not null),
    'both RPCs are SECURITY DEFINER with search_path=public'
  union all select 'preview does not mutate',
    (select preview_def from function_defs) not ilike '%insert into%'
      and (select preview_def from function_defs) not ilike '%update %'
      and (select preview_def from function_defs) not ilike '%delete %',
    'preview only reads candidate payments and account state'
  union all select 'customer payment backfill contract',
    (select apply_def from function_defs) ilike '%invoice_payments%'
      and (select apply_def from function_defs) ilike '%customer_payment%'
      and (select apply_def from function_defs) ilike '%inflow%'
      and (select apply_def from function_defs) ilike '%not exists%treasury_transactions%'
      and (select apply_def from function_defs) ilike '%reversed_at is null%',
    'customer payments become idempotent inflows and reversed rows are excluded'
  union all select 'supplier payment backfill contract',
    (select apply_def from function_defs) ilike '%supplier_invoice_payments%'
      and (select apply_def from function_defs) ilike '%supplier_payment%'
      and (select apply_def from function_defs) ilike '%outflow%'
      and (select apply_def from function_defs) ilike '%not exists%treasury_transactions%'
      and (select apply_def from function_defs) ilike '%reversed_at is null%',
    'supplier payments become idempotent outflows and reversed rows are excluded'
  union all select 'canonical insert and audit',
    (select apply_def from function_defs) ilike '%dmp_treasury_insert%'
      and (select apply_def from function_defs) ilike '%insert into public.audit_log%'
      and (select apply_def from function_defs) ilike '%historical_backfill%',
    'apply uses canonical treasury insertion and audit trace'
  union all select 'company-scoped concurrency lock',
    position('pg_advisory_xact_lock' in lower((select apply_def from function_defs))) > 0
      and position('pg_advisory_xact_lock' in lower((select apply_def from function_defs))) < position('for v_customer' in lower((select apply_def from function_defs)))
      and position('pg_advisory_xact_lock' in lower((select apply_def from function_defs))) < position('for v_supplier' in lower((select apply_def from function_defs)))
      and (select apply_def from function_defs) ilike '%treasury_historical_backfill:%',
    'one deterministic company-scoped advisory lock precedes both candidate loops'
  union all select 'tenant-safe selected account',
    (select preview_def from function_defs) ilike '%company_id = public.current_company_id()%'
      and (select apply_def from function_defs) ilike '%company_id = public.current_company_id()%'
      and (select preview_def from function_defs) ilike '%and active%'
      and (select apply_def from function_defs) ilike '%for update%',
    'selected account belongs to the active current-company tenant'
  union all select 'authenticated execute and public/anon denied',
    has_function_privilege('authenticated', 'public.dmp_preview_treasury_historical_backfill(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_apply_treasury_historical_backfill(uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_preview_treasury_historical_backfill(uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_apply_treasury_historical_backfill(uuid)', 'EXECUTE')
      and not exists (select 1 from pg_proc p, function_oids o, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid in (o.preview_oid, o.apply_oid) and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'backfill RPCs are authenticated-only'
  union all select 'apply permissions and idempotency',
    (select apply_def from function_defs) ilike '%treasury.transactions.create%'
      and (select apply_def from function_defs) ilike '%billing.write%'
      and (select apply_def from function_defs) ilike '%supplier_payments.create%'
      and (select apply_def from function_defs) ilike '%not exists%treasury_transactions%',
    'apply requires management permissions and exact source linkage'
), result as (
  select check_name, passed, detail, 0 as sort_order from checks
  union all
  select 'SUMMARY', bool_and(passed), case when bool_and(passed) then 'PASS' else 'FAIL' end, 1 from checks
)
select check_name, passed, detail
from result
order by sort_order, check_name;
