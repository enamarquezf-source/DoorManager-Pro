with prepare_rpc as (
  select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dmp_prepare_invoice_from_work_order'
), details as (
  select coalesce(jsonb_agg(jsonb_build_object('proname',proname,'identity_arguments',identity_arguments,'prosecdef',prosecdef,'proconfig',proconfig,'quote_reference_context',substring(definition from greatest(position('v_quote - v_quote_accum' in lower(definition))-180,1) for 420)) order by oid),'[]'::jsonb) value from prepare_rpc
), checks(check_name,passed,detail) as (
  select 'prepare_rpc_present',exists(select 1 from prepare_rpc),'prepare definitions='||(select value::text from details)
  union all select 'signature',exists(select 1 from prepare_rpc where identity_arguments='p_work_order_id uuid, p_due_date date, p_notes text, p_tax_rate numeric'),'expected prepare signature='||(select coalesce(string_agg(identity_arguments,', ' order by identity_arguments),'missing') from prepare_rpc)
  union all select 'quote_branch_present',exists(select 1 from prepare_rpc where position('if exists (select 1 from public.quotes' in lower(definition))>0 and position('public.quote_lines' in lower(definition))>0),'quote_id/accepted-quote branch and quote_lines source are present'
  union all select 'v_quote_declared',exists(select 1 from prepare_rpc where position('v_quote numeric' in lower(definition))>0 or position('v_quote public.' in lower(definition))>0),'v_quote declaration='||(select case when exists(select 1 from prepare_rpc where position('v_quote numeric' in lower(definition))>0 or position('v_quote public.' in lower(definition))>0) then 'present' else 'missing' end)
  union all select 'v_quote_problematic_reference',exists(select 1 from prepare_rpc where position('v_line_subtotal' in lower(definition))>0 and position('v_quote - v_quote_accum' in lower(definition))>0),'exact prorating reference context='||(select coalesce(substring(definition from greatest(position('v_quote - v_quote_accum' in lower(definition))-180,1) for 420),'not found') from prepare_rpc limit 1)
  union all select 'security_definer',exists(select 1 from prepare_rpc where prosecdef),'prepare is SECURITY DEFINER'
  union all select 'search_path_public',exists(select 1 from prepare_rpc where exists(select 1 from unnest(coalesce(proconfig,array[]::text[])) as config where lower(config)='search_path=public')),'prepare proconfig='||(select coalesce(string_agg(proconfig::text,'; ' order by oid),'missing') from prepare_rpc)
  union all select 'grants',has_function_privilege('authenticated','public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)','execute') and not has_function_privilege('anon','public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)','execute'),'authenticated execute and anon denial for prepare RPC'
  union all select 'related_wrappers',to_regprocedure('public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)') is not null,'prepare RPC is directly exposed with the expected identity signature'
)
select check_name,passed,detail from checks order by check_name;
