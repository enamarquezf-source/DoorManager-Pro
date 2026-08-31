-- Read-only preflight for 099. It only references the pre-migration contract.
with expected_operations(operation) as (
  values ('INSERT'),('UPDATE'),('DELETE'),('SOFT_DELETE'),('OPERATIONAL_UPDATE'),('TECHNICAL_FINALIZE'),
    ('TECHNICAL_FINALIZE_PENDING_OFFICE'),('OFFICE_VALIDATE'),('OFFICE_REJECT'),('INVOICE_DRAFT_CREATE'),
    ('INVOICE_DRAFT_UPDATE'),('INVOICE_ISSUE'),('INVOICE_ISSUE_OVERRIDE'),('PAYMENT_RECORD'),
    ('MATERIAL_CREATE'),('WAREHOUSE_STOCK_RECONCILE'),('ECONOMIC_REVIEW_APPROVE')
), historical_operations as (
  select distinct operation from public.audit_log where operation is not null
), audit_constraint as (
  select pg_get_constraintdef(c.oid) definition
  from pg_constraint c join pg_class r on r.oid = c.conrelid
  where r.relname = 'audit_log' and c.conname = 'audit_log_operation_check'
), checks as (
  select 'base_tables' check_name,
    (to_regclass('public.work_orders') is not null and to_regclass('public.work_order_time_entries') is not null and to_regclass('public.work_order_materials') is not null and to_regclass('public.work_order_cost_entries') is not null and to_regclass('public.invoices') is not null and to_regclass('public.invoice_work_orders') is not null and to_regclass('public.audit_log') is not null) passed,
    'required billing tables exist' detail
  union all select 'current_billing_rpcs',
    (select count(distinct p.proname) = 4 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('dmp_guided_billing_eligible','dmp_prepare_invoice_from_work_order','dmp_update_invoice_draft','dmp_issue_invoice')),
    '091 billing RPC family is present'
  union all select 'legacy_issue_overload',
    to_regprocedure('public.dmp_issue_invoice(uuid)') is not null and to_regprocedure('public.dmp_issue_invoice(uuid,boolean,text)') is null,
    'only the legacy one-argument issue RPC exists before 099'
  union all select 'legacy_work_order_unique_index',
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'invoice_work_orders_active_work_unique'),
    '099 must remove the one-line-per-work-order index'
  union all select 'active_duplicate_invoice_associations',
    not exists (select 1 from public.invoice_work_orders where deleted_at is null and work_order_id is not null group by work_order_id having count(distinct invoice_id) > 1),
    'no work order is linked to multiple active invoices'
  union all select 'active_invoice_link_cardinality',
    not exists (select 1 from public.invoice_work_orders where deleted_at is null and work_order_id is not null group by invoice_id, work_order_id having count(*) > 1),
    'no invoice/work-order link has duplicate active rows before index removal'
  union all select 'sellable_null_snapshots',
    not exists (select 1 from public.work_order_time_entries where contributes_to_sale and (total_price is null or total_price <= 0 or duration_minutes is null or hourly_price is null))
      and not exists (select 1 from public.work_order_materials where deleted_at is null and contributes_to_sale and (total_price is null or total_price <= 0 or used_quantity is null or unit_price is null))
      and not exists (select 1 from public.work_order_cost_entries where deleted_at is null and contributes_to_sale and (total_price is null or total_price <= 0 or quantity is null or unit_price is null)),
    'sellable snapshots and quantities are complete'
  union all select 'accepted_quote_discount_profile',
    not exists (select 1 from public.quotes where status in ('Aceptado','Ejecutado en cliente') and deleted_at is null and (coalesce(discount_amount,0) > 0 or coalesce(discount_value,0) > 0))
      or exists (select 1 from public.quote_lines ql join public.quotes q on q.id = ql.quote_id where q.status in ('Aceptado','Ejecutado en cliente') and q.deleted_at is null and ql.deleted_at is null),
    'accepted quote discounts have a line representation or require review'
  union all select 'historical_invoice_baseline',
    true,
    (select 'drafts=' || count(*) filter (where status = 'borrador')::text || '; issued=' || count(*) filter (where status <> 'borrador')::text || '; fiscal_snapshots=' || count(*) filter (where fiscal_snapshot is not null)::text from public.invoices)
  union all select 'no_099_columns_yet',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and ((table_name = 'work_orders' and column_name in ('economic_review_status','economic_reviewed_at','economic_reviewed_by','economic_review_reason')) or (table_name = 'invoices' and column_name in ('economic_detail_status','economic_expected_amount','economic_actual_amount','economic_override_reason','economic_override_by','economic_override_at')))),
    '099 metadata columns are not installed yet'
  union all select 'audit_constraint_present',
    exists (select 1 from audit_constraint),
    'current audit operation constraint exists'
  union all select 'current_constraint_operations_compatible',
    not exists (select 1 from historical_operations h where not exists (select 1 from audit_constraint c where position(lower(quote_literal(h.operation)) in lower(c.definition)) > 0)),
    'current constraint accepts every historical operation'
  union all select 'audit_operations_historical_supported',
    not exists (select 1 from historical_operations h where not exists (select 1 from expected_operations e where e.operation = h.operation)),
    '099 allowed set contains every historical operation'
  union all select 'audit_constraint_new_superset',
    not exists (select 1 from (values ('INSERT'),('UPDATE'),('DELETE'),('SOFT_DELETE'),('OPERATIONAL_UPDATE'),('TECHNICAL_FINALIZE'),('TECHNICAL_FINALIZE_PENDING_OFFICE'),('OFFICE_VALIDATE'),('OFFICE_REJECT'),('INVOICE_DRAFT_CREATE'),('INVOICE_DRAFT_UPDATE'),('INVOICE_ISSUE'),('INVOICE_ISSUE_OVERRIDE'),('PAYMENT_RECORD'),('MATERIAL_CREATE'),('WAREHOUSE_STOCK_RECONCILE'),('ECONOMIC_REVIEW_APPROVE')) required(operation) where not exists (select 1 from expected_operations e where e.operation = required.operation)),
    '099 target operation set contains the required runtime operations'
  union all select '091_eligibility_definition',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'dmp_guided_billing_eligible' and position('sat_review_destination' in pg_get_functiondef(p.oid)) > 0),
    'modern SAT/Commercial routing remains in eligibility'
  union all select '092_093_deletion_rpc',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'dmp_delete_invoice_draft' and position('status <> ''borrador''' in pg_get_functiondef(p.oid)) > 0),
    'draft deletion remains restricted'
  union all select 'rls',
    (select relrowsecurity from pg_class where oid = 'public.invoice_work_orders'::regclass),
    'invoice_work_orders RLS is enabled'
  union all select 'security_definer_baseline',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'dmp_prepare_invoice_from_work_order' and p.prosecdef and position('search_path' in coalesce(array_to_string(p.proconfig, ','), '')) > 0),
    'prepare RPC is security definer with search_path'
)
select check_name, passed, detail from checks order by check_name;
