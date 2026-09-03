with target as (
  select a.attrelid, a.attnum
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'materials'
    and a.attname = 'stock_quantity'
    and not a.attisdropped
), public_routines as materialized (
  select p.oid,
         p.proname,
         p.prokind,
         pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prokind in ('f', 'p')
), checks(check_name, passed, detail) as (
  select 'legacy_column_exists', exists (select 1 from target), 'public.materials.stock_quantity exists before 108'
  union all select 'pre_108_contract_present',
    exists (select 1 from target)
      and exists (select 1 from public_routines where proname = 'dmp_lifecycle_delete_plan' and definition ~* 'stock_quantity')
      and exists (select 1 from public_routines where proname = 'dmp_purge_entity_with_cleanup_legacy' and definition ~* 'stock_quantity'),
    'lifecycle and legacy purge still expose the pre-108 stock source'
  union all select 'lifecycle_legacy_dependency',
    exists (select 1 from public_routines where proname = 'dmp_lifecycle_delete_plan' and definition ~* 'stock_quantity'),
    'dmp_lifecycle_delete_plan still reads materials.stock_quantity before 108'
  union all select 'purge_legacy_dependency_known',
    exists (select 1 from public_routines where proname = 'dmp_purge_entity_with_cleanup_legacy' and definition ~* 'stock_quantity'),
    'legacy purge dependency is explicitly accounted for by 108'
  union all select 'legacy_column_internal_dependencies',
    exists (select 1 from target)
      and not exists (
        select 1
        from pg_depend d
        join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
        where d.classid not in ('pg_attrdef'::regclass, 'pg_constraint'::regclass)
      ),
    'only column-owned DEFAULT/CHECK dependencies remain for the non-CASCADE drop'
  union all select 'warehouse_stock_exists', to_regclass('public.warehouse_stock') is not null, 'canonical balance table'
  union all select 'stock_movements_exists', to_regclass('public.stock_movements') is not null, 'canonical ledger table'
  union all select 'canonical_consumption_contract',
    exists (select 1 from public_routines where proname = 'dmp_validate_work_order_material' and definition ~* 'warehouse_stock' and definition ~* 'stock_movements'),
    'consumption updates canonical balance and ledger'
  union all select 'canonical_refund_contract',
    exists (select 1 from public_routines where proname = 'dmp_refund_work_order_material_stock' and definition ~* 'warehouse_stock' and definition ~* 'stock_movements'),
    'refund uses canonical balance and ledger'
  union all select 'legacy_movement_table_retained', to_regclass('public.material_stock_movements') is not null, 'table is retained for historical cleanup'
  union all select 'legacy_apply_endpoint_present_or_disabled',
    to_regprocedure('public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid)') is null
      or not has_function_privilege('authenticated', to_regprocedure('public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid)'), 'EXECUTE'),
    'legacy apply endpoint is absent or inaccessible'
  union all select 'legacy_adjust_endpoint_present_or_disabled',
    to_regprocedure('public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric)') is null
      or not has_function_privilege('authenticated', to_regprocedure('public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric)'), 'EXECUTE'),
    'legacy adjust endpoint is absent or inaccessible'
  union all select 'purge_authenticated',
    to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)'), 'EXECUTE'),
    'current purge remains callable through the authenticated RPC'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
