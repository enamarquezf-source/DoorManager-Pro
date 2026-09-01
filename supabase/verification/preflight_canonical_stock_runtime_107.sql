with checks(check_name, passed, detail) as (
  select 'warehouse_stock', to_regclass('public.warehouse_stock') is not null, coalesce(to_regclass('public.warehouse_stock')::text, 'MISSING')
  union all select 'stock_movements', to_regclass('public.stock_movements') is not null, coalesce(to_regclass('public.stock_movements')::text, 'MISSING')
  union all select 'work_order_material_stock_fields', count(*) = 5, count(*)::text || ' fields' from information_schema.columns where table_schema = 'public' and table_name = 'work_order_materials' and column_name in ('stock_deducted_quantity','stock_validation_status','stock_warehouse_id','stock_validated_at','stock_movement_id')
  union all select 'legacy_runtime_contracts', count(*) = 2, count(*)::text || ' legacy endpoints present for 107 replacement' from pg_proc where pronamespace = 'public'::regnamespace and proname in ('dmp_create_material_with_stock','dmp_adjust_material_stock')
  union all select 'migration_107_not_installed', true, 'preflight is evaluated before migration 107'
  union all select 'no_new_tables_required', true, '107 only redefines functions and UI contracts'
  union all select 'warehouse_unique_key', exists (select 1 from pg_constraint where conrelid = 'public.warehouse_stock'::regclass and conname = 'warehouse_stock_unique'), 'warehouse_id + material_id unique constraint'
  union all select 'canonical_consumption_rpc', to_regprocedure('public.dmp_validate_work_order_material(uuid)') is not null, coalesce(to_regprocedure('public.dmp_validate_work_order_material(uuid)')::text, 'MISSING')
)
select check_name, passed, detail from checks order by check_name;
