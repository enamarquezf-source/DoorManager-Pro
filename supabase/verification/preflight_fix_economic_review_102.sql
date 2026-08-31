with current_rpc as (
  select p.oid,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dmp_review_work_order_economic' and p.pronargs=4
), checks(check_name,passed,detail) as (
  select '101_applied',exists(select 1 from current_rpc where position('v_kind' in definition)>0 and position('entries.row_data order by entries.entry_kind' in lower(definition))>0 and position('order by kind,entry_id' in lower(definition))=0),'101 four-argument review is installed'
  union all select 'known_d_collision',exists(select 1 from current_rpc where position('for d in' in lower(definition))>0 or position('jsonb_array_elements(p_decisions) d' in lower(definition))>0),'pre-102 definition exposes the confirmed d collision'
  union all select 'wrapper_present',to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text)') is not null,'three-argument wrapper exists before 102'
  union all select 'grants_baseline',has_function_privilege('authenticated','public.dmp_review_work_order_economic(uuid,jsonb,text)','execute') and has_function_privilege('authenticated','public.dmp_review_work_order_economic(uuid,jsonb,text,boolean)','execute'),'authenticated grants exist before 102'
  union all select 'no_102_installed',not exists(select 1 from current_rpc where position('v_decision' in definition)>0 and position('decision_element.value' in definition)>0 and position('economic_entries.row_data' in lower(definition))>0),'102 qualified implementation is not installed yet'
  union all select 'no_new_tables',not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in ('economic_reviews','invoice_lines')),'102 requires no new tables'
)
select check_name,passed,detail from checks order by check_name;
