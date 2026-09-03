with function_defs as materialized (
  select p.oid,
         p.proname,
         pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prokind in ('f', 'p')
), checks(check_name, passed, detail) as (
  select 'legacy_column_removed', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity'), 'global stock column absent'
  union all select 'lifecycle_uses_canonical_stock',
    exists (select 1 from function_defs where proname = 'dmp_lifecycle_delete_plan' and body ~* E'sum\\s*\\(\\s*warehouse_stock\\.quantity|sum\\s*\\(\\s*ws\\.quantity')
      and not exists (select 1 from function_defs where proname = 'dmp_lifecycle_delete_plan' and body ~* 'stock_quantity'),
    'material lifecycle stock_activo is based on total warehouse_stock quantity'
  union all select 'runtime_stock_quantity_refs_zero',
    not exists (select 1 from function_defs where body ~* 'stock_quantity'),
    'no deployed public function references stock_quantity'
  union all select 'canonical_stock_present', to_regclass('public.warehouse_stock') is not null, 'warehouse_stock retained'
  union all select 'canonical_ledger_present', to_regclass('public.stock_movements') is not null, 'stock_movements retained'
  union all select 'consume_contract',
    exists (select 1 from function_defs where proname = 'dmp_validate_work_order_material' and body ~* 'warehouse_stock' and body ~* 'stock_movements'),
    'canonical consumption contract'
  union all select 'refund_contract',
    exists (select 1 from function_defs where proname = 'dmp_refund_work_order_material_stock' and body ~* 'warehouse_stock' and body ~* 'stock_movements'),
    'canonical refund contract'
  union all select 'purge_canonical_stock_guard',
    exists (select 1 from function_defs where proname = 'dmp_purge_entity_with_cleanup' and body ~* 'warehouse_stock' and body ~* E'quantity\\s*>\\s*0'),
    'material purge checks canonical stock before deletion'
  union all select 'purge_legacy_historical_cleanup',
    exists (select 1 from function_defs where proname = 'dmp_purge_entity_with_cleanup_legacy' and body ~* 'material_stock_movements'),
    'historical material_stock_movements cleanup remains available'
  union all select 'legacy_stock_endpoints_removed',
    to_regprocedure('public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid)') is null
      and to_regprocedure('public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric)') is null,
    'legacy stock endpoints absent'
  union all select 'material_stock_movements_retained', to_regclass('public.material_stock_movements') is not null, 'legacy movement table retained for historical cleanup'
  union all select 'materials_rls_present',
    exists (select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relname = 'materials' and c.relrowsecurity),
    'materials RLS remains enabled'
  union all select 'purge_authenticated',
    to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)'), 'EXECUTE'),
    'current purge remains callable through the authenticated RPC'
  union all select 'canonical_adjust_grant',
    to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)'), 'EXECUTE'),
    'canonical adjustment RPC remains available'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
