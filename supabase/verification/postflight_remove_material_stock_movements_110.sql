with routines as materialized (
  select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind in ('f', 'p')
), checks(check_name, passed, detail) as (
  select 'legacy_table_absent', to_regclass('public.material_stock_movements') is null, 'legacy table removed'
  union all select 'warehouse_stock_present', to_regclass('public.warehouse_stock') is not null, 'canonical warehouse balance remains'
  union all select 'stock_movements_present', to_regclass('public.stock_movements') is not null, 'canonical stock ledger remains'
  union all select 'work_order_materials_present', to_regclass('public.work_order_materials') is not null, 'work order material usage remains'
  union all select 'canonical_consumption_present',
    exists (select 1 from routines where proname = 'dmp_validate_work_order_material' and position('warehouse_stock' in lower(definition)) > 0 and position('stock_movements' in lower(definition)) > 0),
    'canonical consumption function remains intact'
  union all select 'canonical_refund_present',
    exists (select 1 from routines where proname = 'dmp_refund_work_order_material_stock' and position('warehouse_stock' in lower(definition)) > 0 and position('stock_movements' in lower(definition)) > 0),
    'canonical refund function remains intact'
  union all select 'lifecycle_dependencies_legacy_absent', not exists (select 1 from routines where proname = 'dmp_lifecycle_dependencies' and position('material_stock_movements' in lower(definition)) > 0), 'lifecycle dependencies have no legacy ledger reference'
  union all select 'lifecycle_delete_plan_legacy_absent', not exists (select 1 from routines where proname = 'dmp_lifecycle_delete_plan' and position('material_stock_movements' in lower(definition)) > 0), 'lifecycle delete plan has no legacy ledger reference'
  union all select 'purge_legacy_ref_absent', not exists (select 1 from routines where proname = 'dmp_purge_entity_with_cleanup_legacy' and position('material_stock_movements' in lower(definition)) > 0), 'legacy purge has no legacy ledger reference'
  union all select 'purge_wrapper_ref_absent', not exists (select 1 from routines where proname = 'dmp_purge_entity_with_cleanup' and position('material_stock_movements' in lower(definition)) > 0), 'purge wrapper has no legacy ledger reference'
  union all select 'runtime_legacy_refs_zero', not exists (select 1 from routines where position('material_stock_movements' in lower(definition)) > 0), 'no public runtime function references the legacy ledger'
  union all select 'quote_direct_stock_relation_absent',
    not exists (select 1 from routines where position('stock_movements where quote_id' in lower(replace(replace(replace(definition, chr(10), ' '), chr(13), ' '), chr(9), ' '))) > 0 or position('stock_movements.quote_id' in lower(definition)) > 0),
    'lifecycle and purge do not invent a direct quote ledger relation'
  union all select 'canonical_ledger_has_no_direct_quote_id',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'quote_id'),
    'canonical stock ledger has no direct quote relation'
  union all select 'catalog_dependencies_without_legacy', not exists (select 1 from pg_depend where refobjid = to_regclass('public.material_stock_movements')), 'no catalog dependency references the removed table'
  union all select 'policies_without_legacy', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_stock_movements'), 'no policy references the removed table'
  union all select 'materials_without_legacy_stock_column', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity'), 'materials.stock_quantity remains absent'
  union all select 'canonical_adjust_grant',
    to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)'), 'EXECUTE'),
    'canonical stock adjustment RPC remains available'
  union all select 'canonical_validate_grant',
    to_regprocedure('public.dmp_validate_work_order_material(uuid)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.dmp_validate_work_order_material(uuid)'), 'EXECUTE'),
    'canonical stock validation RPC remains available'
  union all select 'no_unexpected_schema_drop',
    to_regclass('public.materials') is not null
      and to_regclass('public.quotes') is not null
      and to_regclass('public.quote_lines') is not null
      and to_regclass('public.work_orders') is not null,
    'unrelated core schema remains present'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
