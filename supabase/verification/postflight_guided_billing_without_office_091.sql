-- Read-only postflight for migration 091. Returns one result set.
with rpc_defs as (
  select p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dmp_guided_billing_eligible','dmp_prepare_invoice_from_work_order','dmp_update_invoice_draft','dmp_issue_invoice')
), checks as (
  select 'helper_exists' check_name, exists(select 1 from rpc_defs where proname='dmp_guided_billing_eligible') passed, 'modern eligibility helper installed' detail
  union all select 'modern_routing_gate', exists(select 1 from rpc_defs where proname='dmp_guided_billing_eligible' and definition like '%sat_review_destination%') , 'SAT destination gate installed'
  union all select 'legacy_gate_preserved', exists(select 1 from rpc_defs where proname='dmp_guided_billing_eligible' and definition like '%office_validation_status%') , 'legacy Office validation remains supported'
  union all select 'office_removed_from_prepare_gate', exists(select 1 from rpc_defs where proname='dmp_prepare_invoice_from_work_order' and definition like '%dmp_guided_billing_eligible%') , 'prepare uses shared eligibility'
  union all select 'draft_rpc_gate', exists(select 1 from rpc_defs where proname='dmp_update_invoice_draft' and definition like '%dmp_guided_billing_eligible%') , 'draft RPC uses shared eligibility'
  union all select 'office_removed_from_issue_gate', exists(select 1 from rpc_defs where proname='dmp_issue_invoice' and definition like '%dmp_guided_billing_eligible%') , 'issue uses shared eligibility'
  union all select 'authenticated_grants', (has_function_privilege('authenticated','public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)','execute') and has_function_privilege('authenticated','public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric)','execute') and has_function_privilege('authenticated','public.dmp_issue_invoice(uuid)','execute')), 'authenticated can execute guided billing RPCs'
)
select check_name, passed, detail from checks order by check_name;
