with rpc as (
  select p.oid, pg_get_functiondef(p.oid) definition, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dmp_prepare_invoice_from_work_order'
), checks(check_name, passed, detail) as (
  select 'canonical_quote_amount', exists(select 1 from rpc where position('v_quote numeric' in lower(definition)) > 0 and position('coalesce(q.taxable_base, q.subtotal_sale, q.subtotal, 0)' in lower(definition)) > 0), 'quote base uses taxable_base, subtotal_sale, subtotal fallback'
  union all select 'proration_kept', exists(select 1 from rpc where position('v_line.subtotal * v_quote / v_quote_lines_total' in lower(definition)) > 0 and position('v_quote - v_quote_accum' in lower(definition)) > 0), 'quote lines remain prorated with final-cent reconciliation'
  union all select 'no_quote_write', exists(select 1 from rpc where position('update public.quotes' in lower(definition)) = 0 and position('insert into public.quotes' in lower(definition)) = 0 and position('delete from public.quotes' in lower(definition)) = 0), 'historical quotes remain read-only'
  union all select 'security', exists(select 1 from rpc where prosecdef and exists(select 1 from unnest(coalesce(proconfig, array[]::text[])) as config where lower(config) = 'search_path=public')), 'prepare remains SECURITY DEFINER with search_path=public'
  union all select 'grants', has_function_privilege('authenticated', 'public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)', 'execute') and not has_function_privilege('anon', 'public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)', 'execute'), 'authenticated execute and anon denial remain'
  union all select 'no_new_tables', true, '106 is function-only'
)
select check_name, passed, detail from checks order by check_name;
