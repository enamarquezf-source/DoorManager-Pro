-- Read-only postflight for 074. Run after applying the invoicing migration.

with expected_columns(table_name, column_name) as (
  values
    ('invoices','id'),('invoices','company_id'),('invoices','code'),('invoices','client_id'),('invoices','status'),('invoices','issue_date'),('invoices','due_date'),('invoices','subtotal'),('invoices','tax_rate'),('invoices','tax_amount'),('invoices','total_amount'),('invoices','paid_amount'),('invoices','notes'),('invoices','created_by'),('invoices','updated_by'),('invoices','created_at'),('invoices','updated_at'),('invoices','cancelled_at'),('invoices','cancelled_by'),('invoices','cancellation_reason'),
    ('invoice_work_orders','id'),('invoice_work_orders','company_id'),('invoice_work_orders','invoice_id'),('invoice_work_orders','work_order_id'),('invoice_work_orders','description'),('invoice_work_orders','subtotal'),('invoice_work_orders','tax_rate'),('invoice_work_orders','tax_amount'),('invoice_work_orders','total_amount'),('invoice_work_orders','created_at'),('invoice_work_orders','deleted_at'),
    ('invoice_payments','id'),('invoice_payments','company_id'),('invoice_payments','invoice_id'),('invoice_payments','amount'),('invoice_payments','paid_at'),('invoice_payments','method'),('invoice_payments','reference'),('invoice_payments','notes'),('invoice_payments','created_by'),('invoice_payments','created_at'),('invoice_payments','reversed_at'),('invoice_payments','reversed_by'),('invoice_payments','reversal_reason')
),
constraint_state as (
  select pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname = 'audit_log' and c.conname = 'audit_log_operation_check'
),
checks(check_group, check_name, status, affected_rows, details) as (
  select 'GENERAL', 'required_tables', case when count(*) = 3 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 3 tablas 074 presentes'
  from information_schema.tables where table_schema='public' and table_name in ('invoices','invoice_work_orders','invoice_payments')
  union all
  select 'GENERAL', 'required_columns', case when count(*) = 44 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 44 columnas 074 presentes'
  from expected_columns e join information_schema.columns c on c.table_schema='public' and c.table_name=e.table_name and c.column_name=e.column_name
  union all
  select 'GENERAL', 'audit_log_operation_check', case when exists(select 1 from constraint_state) then 'OK' else 'BLOCKER' end, case when exists(select 1 from constraint_state) then 1 else 0 end, coalesce((select definition from constraint_state), 'Falta audit_log_operation_check')
  union all
  select 'GENERAL', 'audit_log_invoice_operations', case when exists(select 1 from constraint_state where definition ilike '%INVOICE_ISSUE%' and definition ilike '%PAYMENT_RECORD%') then 'OK' else 'BLOCKER' end, case when exists(select 1 from constraint_state where definition ilike '%INVOICE_ISSUE%' and definition ilike '%PAYMENT_RECORD%') then 1 else 0 end, 'INVOICE_ISSUE y PAYMENT_RECORD deben estar admitidas'
  union all
  select 'RPC', 'required_functions', case when count(*) = 5 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 5 RPCs de facturacion/cobros presentes'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and ((p.proname='dmp_refresh_invoice_collection' and pg_get_function_identity_arguments(p.oid)='p_invoice_id uuid') or (p.proname='dmp_create_invoice_from_work_order' and pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_tax_rate numeric, p_due_date date, p_notes text') or (p.proname='dmp_record_invoice_payment' and pg_get_function_identity_arguments(p.oid)='p_invoice_id uuid, p_amount numeric, p_paid_at date, p_method text, p_reference text, p_notes text') or (p.proname='dmp_reverse_invoice_payment' and pg_get_function_identity_arguments(p.oid)='p_payment_id uuid, p_reason text') or (p.proname='dmp_cancel_invoice' and pg_get_function_identity_arguments(p.oid)='p_invoice_id uuid, p_reason text'))
  union all
  select 'SECURITY', 'rls_enabled', case when count(*)=3 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 3 tablas 074 con RLS habilitado'
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('invoices','invoice_work_orders','invoice_payments') and c.relrowsecurity
  union all
  select 'SECURITY', 'required_policies', case when count(*)=12 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 12 policies 074 presentes'
  from pg_policies where schemaname='public' and policyname in ('invoices_select_economic_roles','invoices_direct_insert_denied','invoices_direct_update_denied','invoices_direct_delete_denied','invoice_work_orders_select_economic_roles','invoice_work_orders_direct_insert_denied','invoice_work_orders_direct_update_denied','invoice_work_orders_direct_delete_denied','invoice_payments_select_economic_roles','invoice_payments_direct_insert_denied','invoice_payments_direct_update_denied','invoice_payments_direct_delete_denied')
  union all
  select 'DATA', 'active_invoice_duplicates_by_work_order', case when count(*)=0 then 'OK' else 'BLOCKER' end, count(*)::bigint, coalesce(string_agg(work_order_id::text, ', '), 'Ninguno')
  from (select work_order_id from public.invoice_work_orders where deleted_at is null group by work_order_id having count(*)>1) duplicates
  union all
  select 'DATA', 'invoice_links_tenant_mismatch', case when count(*)=0 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' enlaces con empresa incompatible'
  from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id join public.work_orders w on w.id=l.work_order_id where l.company_id is distinct from i.company_id or l.company_id is distinct from w.company_id
  union all
  select 'DATA', 'payment_tenant_mismatch', case when count(*)=0 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' cobros con empresa incompatible'
  from public.invoice_payments p join public.invoices i on i.id=p.invoice_id where p.company_id is distinct from i.company_id
  union all
  select 'DATA', 'invoice_amounts_invalid', case when count(*)=0 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' facturas con importes invalidos'
  from public.invoices where subtotal<0 or tax_rate<0 or tax_amount<0 or total_amount<0 or paid_amount<0 or paid_amount>total_amount
  union all
  select 'AUDIT', 'current_incompatible_audit_rows', case when count(*)=0 then 'OK' else 'BLOCKER' end, count(*)::bigint, coalesce(string_agg(distinct operation, ', ' order by operation), 'Ninguna')
  from public.audit_log where operation not in ('INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE','TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_ISSUE','PAYMENT_RECORD','MATERIAL_CREATE')
),
summary as (
  select 'SUMMARY'::text as check_group, 'postcheck_074'::text as check_name,
    case when count(*) filter(where status='BLOCKER')>0 then 'BLOCKER' when count(*) filter(where status='REVIEW')>0 then 'REVIEW' else 'OK' end as status,
    count(*) filter(where status<>'OK')::bigint as affected_rows,
    case when count(*) filter(where status='BLOCKER')>0 then 'Se han detectado BLOCKER.' when count(*) filter(where status='REVIEW')>0 then 'No hay BLOCKER, pero existen REVIEW.' else '074 validada sin BLOCKER ni REVIEW.' end as details
  from checks
)
select check_group, check_name, status, affected_rows, details
from (
  select check_group, check_name, status, affected_rows, details from checks
  union all
  select check_group, check_name, status, affected_rows, details from summary
) result
order by case check_group when 'SUMMARY' then 2 else 1 end, case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'INFO' then 3 else 4 end, check_name;
