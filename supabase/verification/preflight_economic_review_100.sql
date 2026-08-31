with checks as (
  select 'base_tables' check_name,
    to_regclass('public.work_orders') is not null and to_regclass('public.invoice_work_orders') is not null and to_regclass('public.invoices') is not null and to_regclass('public.audit_log') is not null passed,
    'POST-099 billing tables exist' detail
  union all select '099_columns',
    (select count(*)=4 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name in ('economic_review_status','economic_reviewed_at','economic_reviewed_by','economic_review_reason'))
      and (select count(*)=6 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name in ('economic_detail_status','economic_expected_amount','economic_actual_amount','economic_override_reason','economic_override_by','economic_override_at')),
    '099 metadata columns exist'
  union all select '099_rpcs',
    to_regprocedure('public.dmp_calculate_work_order_economics(uuid)') is not null and to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text)') is not null and to_regprocedure('public.dmp_finalize_work_order_technical(uuid,jsonb)') is not null and to_regprocedure('public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)') is not null and to_regprocedure('public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric)') is not null and to_regprocedure('public.dmp_issue_invoice(uuid,boolean,text)') is not null,
    '099 RPC contracts exist before 100' detail
  union all select '099_economic_eligibility_baseline',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_guided_billing_eligible' and position('economic_status' in lower(pg_get_functiondef(p.oid)))>0)
      and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_prepare_invoice_from_work_order' and position('i.status <> ''cancelada''' in pg_get_functiondef(p.oid))>0 and position('economic_review_status' in pg_get_functiondef(p.oid))>0),
    '099 eligibility and prepare contain the legacy economic/cancelled contract' detail
  union all select '100_absent',
    to_regprocedure('public.dmp_reopen_work_order_economic(uuid,text)') is null and to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text,boolean)') is null,
    '100 RPC overloads are not installed yet' detail
  union all select 'audit_reopen_absent',
    not exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid where r.relname='audit_log' and c.conname='audit_log_operation_check' and position('ECONOMIC_REVIEW_REOPEN' in pg_get_constraintdef(c.oid))>0),
    'reopen audit operation is not installed yet' detail
  union all select 'active_association_baseline',
    not exists(select 1 from public.invoice_work_orders where deleted_at is null and work_order_id is not null group by work_order_id having count(distinct invoice_id)>1),
    'existing active associations are non-conflicting' detail
  union all select 'invoice_baseline',
    true,
    (select 'drafts='||count(*) filter(where status='borrador')::text||'; issued='||count(*) filter(where status='emitida')::text||'; partial='||count(*) filter(where status='parcialmente_cobrada')::text||'; paid='||count(*) filter(where status='cobrada')::text||'; cancelled='||count(*) filter(where status='cancelada')::text from public.invoices) detail
  union all select 'historical_line_baseline',
    true,
    (select 'multi_part_invoices='||count(*)::text from (select invoice_id from public.invoice_work_orders where deleted_at is null and work_order_id is not null group by invoice_id having count(distinct work_order_id)>1) x)||'; manual_lines='||(select count(*)::text from public.invoice_work_orders where deleted_at is null and work_order_id is null) detail
  union all select 'historical_hybrid_baseline',
    true,
    (select 'hybrid_invoices='||count(*)::text from (select invoice_id from public.invoice_work_orders where deleted_at is null group by invoice_id having count(distinct work_order_id) filter (where work_order_id is not null)=1 and count(*) filter (where work_order_id is null)>0) x)||'; linked_manual_lines='||(select count(*)::text from public.invoice_work_orders where deleted_at is null and work_order_id is null and invoice_id in (select invoice_id from public.invoice_work_orders where deleted_at is null and work_order_id is not null)) detail
  union all select 'warranty_baseline',
    true,
    (select 'warranty_parts='||count(*) filter(where warranty)::text||'; warranty_positive_sale='||count(*) filter(where warranty and sale_amount>0)::text from public.work_orders where deleted_at is null) detail
  union all select 'fiscal_snapshot_baseline',
    true,
    (select 'issued_snapshots='||count(*) filter(where status<>'borrador' and fiscal_snapshot is not null)::text from public.invoices) detail
  union all select 'no_new_tables',
    not exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in ('economic_reviews','invoice_lines')),
    '100 introduces no tables' detail
  union all select 'guided_rpc_grant_baseline',
    not has_function_privilege('authenticated','public.dmp_guided_billing_eligible(uuid)','execute'),
    'guided billing helper is internal-only; repository runtime consumers use billing RPCs, not this helper directly' detail
  union all select 'office_finalize_baseline',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_finalize_work_order_technical' and position('oficina' in lower(pg_get_functiondef(p.oid)))>0),
    'baseline records the pre-100 Office permission for explicit removal' detail
  union all select 'overload_baseline',
    to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text)') is not null and to_regprocedure('public.dmp_review_work_order_economic(uuid,jsonb,text,boolean)') is null,
    '099 has the legacy three-argument review contract before 100' detail
)
select check_name, passed, detail from checks order by check_name;
