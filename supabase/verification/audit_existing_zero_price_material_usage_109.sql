with material_usage as (
  select wom.id,
         wom.material_id,
         wom.unit_price,
         wom.source,
         exists (
           select 1
           from public.work_order_planned_material_decisions decision_row
           where decision_row.work_order_material_id = wom.id
             and decision_row.deleted_at is null
             and decision_row.quote_line_id is not null
         ) or wom.source = 'quote' as is_quoted,
         exists (
           select 1
           from public.work_order_planned_material_decisions decision_row
           join public.quote_lines quote_line on quote_line.id = decision_row.quote_line_id
           where decision_row.work_order_material_id = wom.id
             and decision_row.deleted_at is null
             and quote_line.unit_price is distinct from wom.unit_price
         ) as quoted_price_mismatch
  from public.work_order_materials wom
  where wom.deleted_at is null
), metrics as (
  select
    count(*)::bigint as total_work_order_materials,
    count(*) filter (where material_id is not null)::bigint as catalog_material_rows,
    count(*) filter (where material_id is not null and coalesce(unit_price, 0) = 0)::bigint as catalog_material_zero_price_rows,
    count(*) filter (where is_quoted)::bigint as quoted_material_rows,
    count(*) filter (where is_quoted and coalesce(unit_price, 0) = 0)::bigint as quoted_material_zero_price_rows,
    count(*) filter (where material_id is null)::bigint as manual_material_rows,
    count(*) filter (where quoted_price_mismatch)::bigint as quoted_snapshot_mismatch_rows
  from material_usage
)
select jsonb_build_object(
  'total_work_order_materials', total_work_order_materials,
  'catalog_material_rows', catalog_material_rows,
  'catalog_material_zero_price_rows', catalog_material_zero_price_rows,
  'quoted_material_rows', quoted_material_rows,
  'quoted_material_zero_price_rows', quoted_material_zero_price_rows,
  'manual_material_rows', manual_material_rows,
  'quoted_snapshot_mismatch_rows', quoted_snapshot_mismatch_rows
) from metrics;
