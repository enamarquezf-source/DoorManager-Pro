-- Read-only preflight for migrations 071-075. Run against the target database.
-- Stop and review every non-zero result before applying any migration.

select 'quotes_with_immutable_status' as check_name, count(*) as findings
from public.quotes
where status in ('Aceptado', 'Ejecutado en cliente', 'Rechazado', 'Caducado', 'Cancelado')
  and deleted_at is null;

select 'quote_lines_without_company_match' as check_name, count(*) as findings
from public.quote_lines l
join public.quotes q on q.id = l.quote_id
where l.company_id is distinct from q.company_id;

select 'quote_lines_with_invalid_canonical_reference' as check_name, count(*) as findings
from public.quote_lines l
left join public.rate_catalog c on c.id = l.concept_id
left join public.rate_versions rv on rv.id = l.rate_version_id
where l.deleted_at is null
  and l.concept_id is not null
  and (c.id is null or c.company_id is distinct from l.company_id
    or rv.id is null or rv.company_id is distinct from l.company_id or rv.rate_id is distinct from l.concept_id);

select 'canonical_quote_lines_with_incomplete_snapshot' as check_name, count(*) as findings
from public.quote_lines
where deleted_at is null and concept_id is not null
  and (rate_version_id is null or unit is null or unit_cost is null or unit_price is null);

select 'quotes_with_duplicate_positions' as check_name, count(*) as findings
from (
  select quote_id, position
  from public.quote_lines
  where deleted_at is null
  group by quote_id, position
  having count(*) > 1
) duplicates;

select 'accepted_quotes_with_incomplete_canonical_lines' as check_name, count(*) as findings
from public.quotes q
join public.quote_lines l on l.quote_id = q.id and l.deleted_at is null
where q.status in ('Aceptado', 'Ejecutado en cliente')
  and l.material_id is null
  and l.concept_id is null
  and nullif(trim(l.description), '') is null;

select 'work_orders_without_unique_quote_link' as check_name, count(*) as findings
from (
  select quote_id
  from public.work_orders
  where quote_id is not null and deleted_at is null
  group by quote_id
  having count(*) > 1
) duplicates;

select 'technically_finished_work_orders_before_office_migration' as check_name, count(*) as findings
from public.work_orders
where deleted_at is null and status in ('Finalizado tecnicamente', 'Enviado', 'Cerrado')
  and coalesce(to_jsonb(work_orders)->>'office_validation_status', '') = '';

select 'work_orders_with_quotes_needing_review' as check_name, count(*) as findings
from public.work_orders
where deleted_at is null and quote_id is not null;

select 'materials_with_invalid_stock' as check_name, count(*) as findings
from public.materials
where stock_quantity < 0 and not allow_negative_stock;

select 'stock_movements_with_invalid_material_company' as check_name, count(*) as findings
from public.material_stock_movements sm
join public.materials m on m.id = sm.material_id
where sm.company_id is distinct from m.company_id;

select 'work_order_materials_with_invalid_tenant' as check_name, count(*) as findings
from public.work_order_materials e
join public.work_orders w on w.id = e.work_order_id
where e.company_id is distinct from w.company_id;

select 'work_order_time_entries_with_invalid_tenant' as check_name, count(*) as findings
from public.work_order_time_entries e
join public.work_orders w on w.id = e.work_order_id
where e.company_id is distinct from w.company_id;

select 'work_order_cost_entries_with_invalid_tenant' as check_name, count(*) as findings
from public.work_order_cost_entries e
join public.work_orders w on w.id = e.work_order_id
where e.company_id is distinct from w.company_id;

select 'stock_movements_with_invalid_running_balance' as check_name, count(*) as findings
from public.material_stock_movements
where previous_stock < 0 or new_stock < 0;

select 'historical_totals_with_nulls' as check_name, count(*) as findings
from public.work_orders
where deleted_at is null and (sale_amount is null or real_cost_amount is null or margin_amount is null);

select 'target_objects_before_migration' as check_name,
  to_regclass('public.invoices') as invoices_table,
  to_regclass('public.invoice_payments') as invoice_payments_table,
  to_regprocedure('public.dmp_quote_rate_options(uuid)') as quote_rate_rpc,
  to_regprocedure('public.dmp_create_material_with_stock(jsonb)') as material_creation_rpc;
