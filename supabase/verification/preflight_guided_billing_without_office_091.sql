-- Read-only preflight for migration 091. Returns one result set.
with checks as (
  select 'migration_absent' as check_name,
         (to_regclass('public.work_orders') is not null) as passed,
         'work_orders exists' as detail
  union all
  select 'required_routing_columns',
    not exists (select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name in ('sat_review_status','sat_review_destination','commercial_review_status') group by table_schema,table_name having count(*)<3),
    'routing columns available'
  union all
  select 'rpc_signatures',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('dmp_prepare_invoice_from_work_order','dmp_update_invoice_draft','dmp_issue_invoice')),
    'billing RPCs exist'
  union all
  select 'legacy_gate_present',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_prepare_invoice_from_work_order' and pg_get_functiondef(p.oid) like '%office_validation_status%'),
    'current prepare RPC still contains office gate'
)
select check_name, passed, detail from checks order by check_name;
