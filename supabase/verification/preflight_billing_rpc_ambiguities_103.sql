with rpc as (
  select p.oid,p.proname,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dmp_guided_billing_eligible','dmp_prepare_invoice_from_work_order','dmp_update_invoice_draft','dmp_issue_invoice','dmp_cancel_invoice','dmp_reopen_work_order_economic')
), checks(check_name,passed,detail) as (
  select '102_applied',to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text,boolean)') is not null and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_invoice_draft'),'102 billing review and update RPCs are present'
  union all select 'known_status_collision',exists(select 1 from rpc where proname='dmp_update_invoice_draft' and position('status text' in lower(definition))>0 and position('economic_detail_status=status' in lower(definition))>0),'pre-103 update draft definition contains the confirmed status ambiguity'
  union all select 'billing_functions_present',not exists(select required_name from (values ('dmp_guided_billing_eligible'),('dmp_prepare_invoice_from_work_order'),('dmp_update_invoice_draft'),('dmp_issue_invoice'),('dmp_cancel_invoice'),('dmp_reopen_work_order_economic')) required(required_name) where not exists(select 1 from rpc where rpc.proname=required_name)),'all billing RPC dependencies are present before 103'
  union all select 'grants_baseline',has_function_privilege('authenticated','public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric)','execute') and has_function_privilege('authenticated','public.dmp_issue_invoice(uuid,boolean,text)','execute'),'authenticated billing grants exist before 103'
  union all select 'no_103_installed',not exists(select 1 from rpc where proname='dmp_update_invoice_draft' and position('v_status' in definition)>0 and position('billing_entry.invoice_id' in lower(definition))>0),'103 qualified billing implementation is not installed yet'
  union all select 'no_new_tables',not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in ('economic_reviews','invoice_lines')),'103 requires no new tables'
)
select check_name,passed,detail from checks order by check_name;
