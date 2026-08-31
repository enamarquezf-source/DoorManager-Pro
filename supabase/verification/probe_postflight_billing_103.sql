with rpc as (
  select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dmp_guided_billing_eligible','dmp_prepare_invoice_from_work_order','dmp_update_invoice_draft','dmp_issue_invoice','dmp_cancel_invoice','dmp_reopen_work_order_economic')
), issue as (
  select coalesce(jsonb_agg(jsonb_build_object('oid',oid,'identity_arguments',identity_arguments,'has_eligibility',position('dmp_guided_billing_eligible' in definition)>0,'has_qualified_group_by',position('group by billing_entry.work_order_id' in lower(definition))>0,'has_unqualified_group_by',position('group by work_order_id' in lower(definition))>0,'has_fiscal_snapshot',position('fiscal_snapshot' in definition)>0) order by oid),'[]'::jsonb) detail
  from rpc where proname='dmp_issue_invoice'
), collision_hits as (
  select coalesce(jsonb_agg(jsonb_build_object('proname',proname,'identity_arguments',identity_arguments,'status_assignment',position('economic_detail_status=status' in lower(definition))>0,'short_line_alias',position('jsonb_array_elements(p_lines) l' in lower(definition))>0,'generic_profile_declaration',position('declare a public.' in lower(definition))>0) order by oid),'[]'::jsonb) detail
  from rpc
  where position('economic_detail_status=status' in lower(definition))>0 or position('jsonb_array_elements(p_lines) l' in lower(definition))>0 or position('declare a public.' in lower(definition))>0
), checks(check_name,passed,detail) as (
  select 'issue_rpc_definition',jsonb_array_length(issue.detail)>0,'dmp_issue_invoice overload definitions: '||issue.detail::text from issue
  union all select 'issue_eligibility',coalesce((issue.detail->0->>'has_eligibility')::boolean,false),'dmp_issue_invoice eligibility subcondition: '||coalesce((issue.detail->0->>'has_eligibility'),'false') from issue
  union all select 'issue_group_by_exact_postflight',coalesce((issue.detail->0->>'has_unqualified_group_by')::boolean,false),'postflight literal group-by condition: '||coalesce((issue.detail->0->>'has_unqualified_group_by'),'false')||'; qualified equivalent: '||coalesce((issue.detail->0->>'has_qualified_group_by'),'false') from issue
  union all select 'issue_snapshot',coalesce((issue.detail->0->>'has_fiscal_snapshot')::boolean,false),'dmp_issue_invoice fiscal_snapshot subcondition: '||coalesce((issue.detail->0->>'has_fiscal_snapshot'),'false') from issue
  union all select 'known_collision_pattern_hits',jsonb_array_length(collision_hits.detail)=0,'Functions matching the exact postflight collision patterns: '||collision_hits.detail::text from collision_hits
  union all select 'overloads',true,'Relevant overloads: '||(select coalesce(jsonb_agg(jsonb_build_object('proname',proname,'identity_arguments',identity_arguments) order by proname,identity_arguments),'[]'::jsonb)::text from rpc)
  union all select 'security_and_search_path',not exists(select 1 from rpc where not prosecdef or position('search_path=public' in lower(coalesce(array_to_string(proconfig,','),'')))=0),'SECURITY DEFINER and search_path=public status for relevant billing RPCs: '||(select coalesce(jsonb_agg(jsonb_build_object('proname',proname,'identity_arguments',identity_arguments,'security_definer',prosecdef,'proconfig',proconfig) order by proname,identity_arguments),'[]'::jsonb)::text from rpc)
  union all select 'grants',has_function_privilege('authenticated','public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric)','execute') and has_function_privilege('authenticated','public.dmp_issue_invoice(uuid,boolean,text)','execute') and not has_function_privilege('anon','public.dmp_issue_invoice(uuid,boolean,text)','execute'),'authenticated/anon execute grant status for update and issue RPCs'
)
select check_name,passed,detail from checks order by check_name;
