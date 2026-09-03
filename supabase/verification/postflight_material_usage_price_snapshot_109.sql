with rpc as materialized (
  select p.oid, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid = to_regprocedure('public.dmp_submit_work_order_material(jsonb)')
), stock_rpc as materialized (
  select p.oid, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid = to_regprocedure('public.dmp_validate_work_order_material(uuid)')
), checks(check_name, passed, detail) as (
  select 'submit_rpc_installed', exists (select 1 from rpc), 'dmp_submit_work_order_material(jsonb) is installed'
  union all select 'submit_rpc_security_definer', exists (select 1 from rpc where prosecdef), 'RPC is SECURITY DEFINER'
  union all select 'submit_rpc_search_path', exists (select 1 from rpc r where exists (select 1 from unnest(coalesce(r.proconfig, array[]::text[])) config where config = 'search_path=public')), 'RPC has search_path=public'
  union all select 'submit_rpc_authenticated_grant', coalesce(has_function_privilege('authenticated', to_regprocedure('public.dmp_submit_work_order_material(jsonb)'), 'EXECUTE'), false), 'authenticated can execute the RPC'
  union all select 'quote_snapshot_source',
    exists (select 1 from rpc where definition ~* 'from public\.quote_lines ql' and definition ~* 'v_quote_line\.unit_cost' and definition ~* 'v_quote_line\.unit_price'),
    'quoted usage snapshots unit economics from quote_lines'
  union all select 'quote_line_belongs_to_work_order_quote',
    exists (select 1 from rpc where definition ~* 'ql\.company_id = v_work\.company_id' and definition ~* 'q\.company_id = v_work\.company_id' and definition ~* 'v_quote_line\.quote_id <> v_work\.quote_id'),
    'quote line is checked against the work order quote and tenant'
  union all select 'quote_line_material_matches', exists (select 1 from rpc where definition ~* 'v_quote_line\.material_id is distinct from v_material_id'), 'quoted material must match the quote line material'
  union all select 'catalog_snapshot_source',
    exists (select 1 from rpc where definition ~* 'v_material\.cost' and definition ~* 'v_material\.price' and definition ~* 'if v_quote_line_id is null then'),
    'non-quoted catalog usage snapshots from materials'
  union all select 'technician_cannot_author_price',
    exists (select 1 from rpc where definition ~* 'v_admin boolean := public\.has_any_role' and definition ~* 'v_admin and v_requested_price' and definition ~* 'v_admin and v_requested_cost'),
    'client prices only participate through the existing administrative override guard'
  union all select 'manual_material_zero_snapshot',
    exists (select 1 from rpc where definition ~* 'v_unit_cost numeric := 0' and definition ~* 'v_unit_price numeric := 0' and definition ~* 'v_material_id is null'),
    'manual material has no invented economic snapshot'
  union all select 'update_preserves_snapshot',
    not exists (select 1 from rpc where definition ~* 'update public\.work_order_materials set[^;]*unit_(cost|price)[[:space:]]*=') and exists (select 1 from rpc where definition ~* 'stock_warehouse_id = v_warehouse_id'),
    'updates change operational fields without refreshing unit prices'
  union all select 'stock_validation_does_not_rewrite_prices',
    exists (select 1 from stock_rpc) and not exists (select 1 from stock_rpc where definition ~* 'unit_(cost|price)[[:space:]]*='),
    'stock validation only changes stock fields and movement state'
  union all select 'canonical_stock_contract',
    to_regclass('public.warehouse_stock') is not null and to_regclass('public.stock_movements') is not null,
    'canonical stock tables remain present'
  union all select 'no_legacy_stock_dependency', not exists (select 1 from rpc where definition ~* 'materials\.stock_quantity'), 'RPC does not reference legacy stock'
  union all select 'no_historical_ledger_dependency', not exists (select 1 from rpc where definition ~* 'material_stock_movements'), 'RPC does not introduce the historical movement ledger'
  union all select 'quote_line_trace_contract',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_planned_material_decisions' and column_name = 'quote_line_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_planned_material_decisions' and column_name = 'work_order_material_id' and data_type = 'uuid'),
    'quote_line_id remains traceable through planned material decisions'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
