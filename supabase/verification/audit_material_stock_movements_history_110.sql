with legacy as materialized (
  select * from public.material_stock_movements
), summary as (
  select
    count(*)::bigint as total_rows,
    count(*) filter (where deleted_at is null)::bigint as live_rows,
    count(*) filter (where deleted_at is not null)::bigint as deleted_rows,
    count(*) filter (where material_id is not null)::bigint as rows_with_material,
    count(*) filter (where work_order_id is not null)::bigint as rows_with_work_order,
    count(*) filter (where work_order_material_id is not null)::bigint as rows_with_work_order_material,
    count(*) filter (where quote_id is not null)::bigint as rows_with_quote,
    count(*) filter (where unit_cost is not null and unit_cost > 0)::bigint as rows_with_positive_unit_cost,
    count(*) filter (where movement_type = 'out' and source = 'work_order')::bigint as work_order_out_rows
  from legacy
), referential as (
  select
    count(*) filter (where m.id is null)::bigint as orphan_material_rows,
    count(*) filter (where w.id is null and l.work_order_id is not null)::bigint as orphan_work_order_rows,
    count(*) filter (where wom.id is null and l.work_order_material_id is not null)::bigint as orphan_work_order_material_rows,
    count(*) filter (where q.id is null and l.quote_id is not null)::bigint as orphan_quote_rows
  from legacy l
  left join public.materials m on m.id = l.material_id
  left join public.work_orders w on w.id = l.work_order_id
  left join public.work_order_materials wom on wom.id = l.work_order_material_id
  left join public.quotes q on q.id = l.quote_id
), canonical_match as (
  select
    count(*) filter (where sm.id is not null)::bigint as matched_canonical_rows,
    count(*) filter (where l.work_order_material_id is not null and sm.id is null)::bigint as unmatched_usage_rows
  from legacy l
  left join lateral (
    select id
    from public.stock_movements
    where work_order_material_id = l.work_order_material_id
      and movement_type = 'Consumo en parte'
    order by created_at desc, id desc
    limit 1
  ) sm on l.work_order_material_id is not null
)
select jsonb_build_object(
  'decision', case when s.total_rows = 0 then 'SAFE TO DROP NOW' else 'SAFE TO DROP AFTER HISTORICAL AUDIT' end,
  'legacy', to_jsonb(s),
  'referential_integrity', to_jsonb(r),
  'canonical_match', to_jsonb(c),
  'requires_manual_review', s.total_rows > 0 and (r.orphan_work_order_material_rows > 0 or c.unmatched_usage_rows > 0 or s.work_order_out_rows > c.matched_canonical_rows)
)
from summary s
cross join referential r
cross join canonical_match c;
