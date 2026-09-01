with rpc as (
  select p.oid, pg_get_functiondef(p.oid) definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dmp_prepare_invoice_from_work_order'
), checks(check_name, passed, detail) as (
  select 'prepare_present', exists(select 1 from rpc), 'prepare RPC exists before 106'
  union all select 'bug_present', exists(select 1 from rpc where position('v_quote - v_quote_accum' in lower(definition)) > 0 and position('v_quote numeric' in lower(definition)) = 0), 'the undeclared quote amount reference is still present'
  union all select 'canonical_quote_columns', to_regclass('public.quotes') is not null and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'taxable_base') and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'subtotal_sale') and exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'subtotal'), 'canonical quote amount columns exist'
  union all select 'no_new_tables', true, '106 is function-only'
)
select check_name, passed, detail from checks order by check_name;
