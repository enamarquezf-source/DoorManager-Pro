with routines as materialized (
  select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind in ('f', 'p')
), checks(check_name, passed, detail) as (
  select 'legacy_table_present', to_regclass('public.material_stock_movements') is not null, 'legacy table exists before 110'
  union all select 'canonical_warehouse_stock_present', to_regclass('public.warehouse_stock') is not null, 'canonical warehouse balance exists'
  union all select 'canonical_stock_movements_present', to_regclass('public.stock_movements') is not null, 'canonical stock ledger exists'
  union all select 'work_order_materials_present', to_regclass('public.work_order_materials') is not null, 'work order material usage exists'
  union all select 'canonical_consumption_contract',
    exists (select 1 from routines where proname = 'dmp_validate_work_order_material' and position('warehouse_stock' in lower(definition)) > 0 and position('stock_movements' in lower(definition)) > 0),
    'canonical consumption function is deployed'
  union all select 'canonical_refund_contract',
    exists (select 1 from routines where proname = 'dmp_refund_work_order_material_stock' and position('warehouse_stock' in lower(definition)) > 0 and position('stock_movements' in lower(definition)) > 0),
    'canonical refund function is deployed'
  union all select 'lifecycle_legacy_dependency_known',
    exists (select 1 from routines where proname = 'dmp_lifecycle_delete_plan' and position('material_stock_movements' in lower(definition)) > 0),
    'lifecycle legacy dependency is known before 110'
  union all select 'purge_legacy_dependency_known',
    exists (select 1 from routines where proname in ('dmp_purge_entity_with_cleanup', 'dmp_purge_entity_with_cleanup_legacy') and position('material_stock_movements' in lower(definition)) > 0),
    'purge legacy dependency is known before 110'
  union all select 'lifecycle_dependencies_legacy_dependency_known',
    exists (select 1 from routines where proname = 'dmp_lifecycle_dependencies' and position('material_stock_movements' in lower(definition)) > 0),
    'lifecycle dependencies legacy dependency is known before 110'
  union all select 'lifecycle_delete_plan_legacy_dependency_known',
    exists (select 1 from routines where proname = 'dmp_lifecycle_delete_plan' and position('material_stock_movements' in lower(definition)) > 0),
    'lifecycle delete plan legacy dependency is known before 110'
  union all select 'no_legacy_operational_writers',
    not exists (select 1 from routines where position('insert into public.material_stock_movements' in lower(definition)) > 0 or position('update public.material_stock_movements' in lower(definition)) > 0),
    'no deployed public function writes the legacy ledger'
  union all select 'canonical_stock_contract_intact',
    exists (select 1 from routines where proname = 'dmp_validate_work_order_material' and position('warehouse_stock' in lower(definition)) > 0)
      and exists (select 1 from routines where proname = 'dmp_refund_work_order_material_stock' and position('stock_movements' in lower(definition)) > 0),
    'canonical stock functions remain available'
  union all select 'legacy_table_rls_enabled',
    exists (select 1 from pg_class c where c.oid = to_regclass('public.material_stock_movements') and c.relrowsecurity),
    'legacy table retains its existing RLS boundary before removal'
  union all select 'no_materials_legacy_stock_column',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity'),
    'materials.stock_quantity remains absent'
  union all select 'canonical_ledger_has_no_direct_quote_id',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'quote_id'),
    'canonical stock ledger has no direct quote relation'
  union all select 'no_unknown_critical_dependencies',
    not exists (select 1 from pg_depend where refobjid = to_regclass('public.material_stock_movements') and deptype = 'n'),
    'no normal catalog dependency blocks a non-CASCADE drop'
  union all select 'historical_rows_audited_before_drop',
    not exists (select 1 from public.material_stock_movements),
    'legacy rows must be audited/exported and cleared before 110'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
