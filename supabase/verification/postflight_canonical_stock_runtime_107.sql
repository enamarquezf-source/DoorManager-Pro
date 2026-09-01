with defs as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('dmp_create_material_with_stock','dmp_adjust_warehouse_stock','dmp_apply_material_stock_movement','dmp_adjust_material_stock','dmp_delete_work_order_material','dmp_refund_work_order_material_stock','dmp_validate_work_order_material')
), checks(check_name, passed, detail) as (
  select 'runtime_functions_do_not_write_legacy_stock', not exists (select 1 from defs where body ~* 'update\s+public\.materials\s+set[^;]*stock_quantity'), 'no legacy stock update in canonical runtime definitions'
  union all select 'runtime_functions_do_not_insert_legacy_movements', not exists (select 1 from defs where body ~* 'insert\s+into\s+public\.material_stock_movements'), 'no legacy movement insert'
  union all select 'refund_uses_warehouse_stock', coalesce((select body from defs where proname = 'dmp_refund_work_order_material_stock'), '') ~* 'update\s+public\.warehouse_stock', 'refund updates warehouse stock'
  union all select 'refund_uses_usage_warehouse', coalesce((select body from defs where proname = 'dmp_refund_work_order_material_stock'), '') ~* 'stock_warehouse_id', 'refund uses the usage warehouse'
  union all select 'consumption_is_canonical', coalesce((select body from defs where proname = 'dmp_validate_work_order_material'), '') ~* 'warehouse_stock' and coalesce((select body from defs where proname = 'dmp_validate_work_order_material'), '') ~* 'stock_movements', 'validation updates balance and ledger'
  union all select 'consumption_idempotent', exists (select 1 from pg_class where relname = 'stock_movements_work_order_material_once'), 'unique movement per work order material'
  union all select 'security_definer_search_path', not exists (select 1 from defs where not prosecdef or not exists (select 1 from unnest(coalesce(defs.proconfig, array[]::text[])) as config where lower(config) = 'search_path=public')), 'canonical functions use prosecdef=true and proconfig search_path=public'
  union all select 'legacy_column_still_exists', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity'), 'physical column retained for later migration'
  union all select 'legacy_table_still_exists', to_regclass('public.material_stock_movements') is not null, 'physical table retained for historical transition'
)
select check_name, passed, detail from checks order by check_name;
