-- Read-only postflight for migrations 071-075. Run after applying them.

select 'canonical_quote_rate_rpc' as check_name, count(*) as installed
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'dmp_quote_rate_options';

select 'office_validation_columns' as check_name, count(*) as installed
from information_schema.columns
where table_schema = 'public' and table_name = 'work_orders'
  and column_name in ('office_validation_status', 'office_validation_reason', 'office_validated_at', 'office_validated_by');

select 'billing_objects' as check_name, count(*) as installed
from information_schema.tables
where table_schema = 'public' and table_name in ('invoices', 'invoice_work_orders', 'invoice_payments');

select 'stock_creation_rpc' as check_name, count(*) as installed
from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'dmp_create_material_with_stock';

select 'active_invoice_duplicates_by_work_order' as check_name, count(*) as findings
from (
  select iw.work_order_id
  from public.invoice_work_orders iw
  join public.invoices i on i.id = iw.invoice_id
  where i.deleted_at is null and coalesce(i.status, '') <> 'Cancelada'
  group by iw.work_order_id
  having count(distinct i.id) > 1
) duplicates;

select 'invoice_links_with_invalid_tenant' as check_name, count(*) as findings
from public.invoice_work_orders l
join public.invoices i on i.id = l.invoice_id
join public.work_orders w on w.id = l.work_order_id
where l.deleted_at is null
  and (l.company_id is distinct from i.company_id or l.company_id is distinct from w.company_id);

select 'invoice_payments_with_invalid_tenant' as check_name, count(*) as findings
from public.invoice_payments p
join public.invoices i on i.id = p.invoice_id
where p.company_id is distinct from i.company_id;

select 'validated_work_orders_missing_validation_date' as check_name, count(*) as findings
from public.work_orders
where office_validation_status = 'validated'
  and office_validated_at is null;

select 'canonical_lines_missing_version_snapshot' as check_name, count(*) as findings
from public.quote_lines
where concept_id is not null and rate_version_id is null and deleted_at is null;

select 'canonical_lines_with_mismatched_version_snapshot' as check_name, count(*) as findings
from public.quote_lines l
left join public.rate_catalog c on c.id = l.concept_id
left join public.rate_versions rv on rv.id = l.rate_version_id
where l.concept_id is not null and l.deleted_at is null
  and (c.id is null or rv.id is null or rv.rate_id is distinct from l.concept_id
    or rv.company_id is distinct from l.company_id or c.company_id is distinct from l.company_id);

select 'materials_stock_movements_consistency' as check_name, count(*) as findings
from public.materials m
where m.stock_quantity < 0 and not m.allow_negative_stock;

select 'stock_movement_chain_inconsistency' as check_name, count(*) as findings
from public.material_stock_movements sm
join public.materials m on m.id = sm.material_id
where sm.deleted_at is null
  and sm.new_stock < 0
  and not m.allow_negative_stock;

select 'required_rls_policies' as check_name, count(*) as installed
from pg_policies
where schemaname = 'public'
  and policyname in (
    'work_orders_select_by_role',
    'invoice_work_orders_direct_insert_denied',
    'material_stock_movements_insert_block_direct'
  );

select 'required_function_grants' as check_name, count(*) as installed
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('dmp_quote_rate_options', 'dmp_create_invoice_from_work_order', 'dmp_create_material_with_stock')
  and grantee = 'authenticated'
  and privilege_type = 'EXECUTE';
