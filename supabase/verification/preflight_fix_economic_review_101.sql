with current_rpc as (
  select p.oid,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dmp_review_work_order_economic' and p.pronargs=4
 ), checks(check_name, passed, detail) as (
  select '100_applied' check_name, to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text,boolean)') is not null and exists(select 1 from current_rpc where position('order by kind,entry_id' in lower(definition))>0), '100 four-argument review is present with the pre-101 ambiguous ORDER BY' detail
  union all select 'wrapper_present', to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text)') is not null, 'three-argument wrapper exists before 101' detail
  union all select 'grants_baseline', has_function_privilege('authenticated','public.dmp_review_work_order_economic(uuid,jsonb,text)','execute') and has_function_privilege('authenticated','public.dmp_review_work_order_economic(uuid,jsonb,text,boolean)','execute'), 'authenticated grants exist before 101' detail
  union all select 'no_101_marker', not exists(select 1 from current_rpc where position('v_kind' in definition)>0 and position('entries.row_data order by entries.entry_kind' in lower(definition))>0), '101 qualified-alias implementation is not installed yet' detail
  union all select 'no_new_tables', not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in ('economic_reviews','invoice_lines')), '101 requires no new tables' detail
)
select check_name,passed,detail from checks order by check_name;
