-- Read-only preflight for 094.
-- This audits the schema BEFORE 094. Future objects are inspected only
-- through metadata; no future table column is referenced as a SQL identifier.

with checks(check_group, check_name, observed_value, result) as (
  select 'schema',
         'base tables',
         current_database(),
         case when to_regclass('public.warehouse_stock') is not null
                    and to_regclass('public.stock_movements') is not null
              then 'OK' else 'REVIEW' end

  union all

  select 'future_column',
         x.table_name || '.' || x.column_name,
         (select count(*)::text
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = x.table_name
            and c.column_name = x.column_name),
         case when not exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public'
             and c.table_name = x.table_name
             and c.column_name = x.column_name
         ) then 'OK / expected absent' else 'REVIEW / partially applied' end
  from (values
    ('work_order_materials', 'stock_validation_status'),
    ('work_order_materials', 'stock_warehouse_id'),
    ('work_order_materials', 'stock_validated_at'),
    ('work_order_materials', 'stock_validated_by'),
    ('work_order_materials', 'stock_movement_id'),
    ('stock_movements', 'work_order_material_id'),
    ('stock_movements', 'idempotency_key')
  ) as x(table_name, column_name)

  union all

  select 'future_constraint',
         'work_order_materials_stock_validation_status_check',
         (select count(*)::text
          from pg_constraint con
          join pg_class rel on rel.oid = con.conrelid
          join pg_namespace nsp on nsp.oid = rel.relnamespace
          where nsp.nspname = 'public'
            and rel.relname = 'work_order_materials'
            and con.conname = 'work_order_materials_stock_validation_status_check'),
         case when not exists (
           select 1
           from pg_constraint con
           join pg_class rel on rel.oid = con.conrelid
           join pg_namespace nsp on nsp.oid = rel.relnamespace
           where nsp.nspname = 'public'
             and rel.relname = 'work_order_materials'
             and con.conname = 'work_order_materials_stock_validation_status_check'
         ) then 'OK / expected absent' else 'REVIEW / partially applied' end

  union all

  select 'future_index',
         x.index_name,
         (select count(*)::text from pg_indexes i where i.schemaname = 'public' and i.indexname = x.index_name),
         case when not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = x.index_name)
              then 'OK / expected absent' else 'REVIEW / partially applied' end
  from (values
    ('stock_movements_work_order_material_once'),
    ('stock_movements_company_idempotency_key'),
    ('work_order_materials_pending_stock_idx')
  ) as x(index_name)

  union all

  select 'future_rpc',
         x.signature,
         case when to_regprocedure(x.signature) is null then '0' else '1' end,
         case when to_regprocedure(x.signature) is null then 'OK / expected absent' else 'REVIEW / partially applied' end
  from (values
    ('public.dmp_submit_work_order_material(jsonb)'),
    ('public.dmp_validate_work_order_material(uuid)'),
    ('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')
  ) as x(signature)

  union all

  select 'pre_094_history',
         'work_order_materials_current_rows',
         count(*)::text,
         'OK / pre-094 columns only'
  from public.work_order_materials
  where deleted_at is null

  union all

  select 'pre_094_history',
         'work_order_materials_catalogue_rows',
         count(*)::text,
         'OK / pre-094 columns only'
  from public.work_order_materials
  where deleted_at is null
    and material_id is not null
    and used_quantity > 0
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
