with routines as materialized (
  select p.oid, p.proname, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind in ('f', 'p')
), checks(check_name, passed, detail) as (
  select 'legacy_table_exists', to_regclass('public.material_stock_movements') is not null, 'legacy table remains available until migration 110'
  union all select 'legacy_rows_zero', not exists (select 1 from public.material_stock_movements), 'cleanup removed every legacy row'
  union all select 'canonical_warehouse_stock_present', to_regclass('public.warehouse_stock') is not null, 'canonical warehouse balance remains'
  union all select 'canonical_stock_movements_present', to_regclass('public.stock_movements') is not null, 'canonical stock ledger remains'
  union all select 'canonical_consumption_present',
    exists (select 1 from routines where proname = 'dmp_validate_work_order_material' and position('warehouse_stock' in lower(definition)) > 0 and position('stock_movements' in lower(definition)) > 0),
    'canonical consumption RPC remains available'
  union all select 'canonical_refund_present',
    exists (select 1 from routines where proname = 'dmp_refund_work_order_material_stock' and position('warehouse_stock' in lower(definition)) > 0 and position('stock_movements' in lower(definition)) > 0),
    'canonical refund RPC remains available'
  union all select 'no_operational_legacy_writers',
    not exists (select 1 from routines where position('insert into public.material_stock_movements' in lower(definition)) > 0 or position('update public.material_stock_movements' in lower(definition)) > 0),
    'no deployed public function writes the legacy table'
  union all select 'materials_stock_quantity_absent',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity'),
    'legacy material stock column remains absent'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
