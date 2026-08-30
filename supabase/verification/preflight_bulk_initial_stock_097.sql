-- Read-only preflight for 097. No RPC is invoked and no data is mutated.
-- One homogeneous result set is returned.
with checks(check_group, check_name, observed_value, result) as (
  select 'baseline', '094/095/096 RPCs',
         concat(to_regprocedure('public.dmp_submit_work_order_material(jsonb)'), '; ',
                to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)'), '; ',
                to_regprocedure('public.dmp_validate_work_order_material(uuid)')),
         case when to_regprocedure('public.dmp_submit_work_order_material(jsonb)') is not null
                    and to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)') is not null
                    and to_regprocedure('public.dmp_validate_work_order_material(uuid)') is not null
              then 'OK' else 'BLOCKER' end
  union all
  select 'schema', 'warehouse_stock and stock_movements',
         concat(to_regclass('public.warehouse_stock'), '; ', to_regclass('public.stock_movements')),
         case when to_regclass('public.warehouse_stock') is not null and to_regclass('public.stock_movements') is not null then 'OK' else 'BLOCKER' end
  union all
  select 'schema', x.table_name || '.' || x.column_name, count(c.column_name)::text,
         case when count(c.column_name) = 1 then 'OK' else 'BLOCKER' end
  from (values
    ('warehouse_stock', 'company_id'), ('warehouse_stock', 'warehouse_id'), ('warehouse_stock', 'material_id'), ('warehouse_stock', 'quantity'),
    ('stock_movements', 'company_id'), ('stock_movements', 'warehouse_id'), ('stock_movements', 'material_id'), ('stock_movements', 'quantity'),
    ('stock_movements', 'created_by'), ('stock_movements', 'idempotency_key')
  ) as x(table_name, column_name)
  left join information_schema.columns c on c.table_schema = 'public' and c.table_name = x.table_name and c.column_name = x.column_name
  group by x.table_name, x.column_name
  union all
  select 'candidate_counts', 'legacy positive without canonical', count(*)::text, 'INFO'
  from public.materials m
  where m.deleted_at is null and m.stock_quantity > 0
    and not exists (select 1 from public.warehouse_stock ws where ws.material_id = m.id)
  union all
  select 'candidate_counts', 'legacy zero without canonical', count(*)::text, 'INFO'
  from public.materials m
  where m.deleted_at is null and m.stock_quantity = 0
    and not exists (select 1 from public.warehouse_stock ws where ws.material_id = m.id)
  union all
  select 'review_counts', 'canonical/mismatch/multiwarehouse',
         concat(count(*) filter (where canonical_rows = 1 and canonical_total = legacy_quantity), '/',
                count(*) filter (where canonical_rows = 1 and canonical_total <> legacy_quantity), '/',
                count(*) filter (where canonical_rows > 1)), 'INFO'
  from (
    select m.id, m.stock_quantity as legacy_quantity, count(ws.id) as canonical_rows, coalesce(sum(ws.quantity), 0) as canonical_total
    from public.materials m join public.warehouse_stock ws on ws.material_id = m.id
    where m.deleted_at is null group by m.id, m.stock_quantity
  ) summary
  union all
  select 'existing_openings', 'warehouse_stock rows', count(*)::text, 'INFO' from public.warehouse_stock
  union all
  select 'duplicates', 'material/warehouse duplicate rows', coalesce(sum(n - 1), 0)::text,
         case when coalesce(sum(n - 1), 0) = 0 then 'OK' else 'BLOCKER' end
  from (select count(*) n from public.warehouse_stock group by warehouse_id, material_id having count(*) > 1) d
  union all
  select 'rpc', 'batch signature absent before 097', coalesce(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')::text, 'absent'),
         case when to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)') is null then 'OK / expected absent' else 'BLOCKER / partially applied' end
  union all
  select 'constraints', 'warehouse_stock unique constraint', count(*)::text,
         case when count(*) > 0 then 'OK' else 'BLOCKER' end
  from pg_constraint con join pg_class rel on rel.oid = con.conrelid join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'warehouse_stock' and con.conname = 'warehouse_stock_unique'
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
