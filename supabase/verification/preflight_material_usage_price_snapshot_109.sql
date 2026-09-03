with rpc as materialized (
  select p.oid, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  where p.oid = to_regprocedure('public.dmp_submit_work_order_material(jsonb)')
), checks(check_name, passed, detail) as (
  select 'work_order_materials_unit_cost', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_materials' and column_name = 'unit_cost' and data_type = 'numeric' and is_nullable = 'NO'), 'WOM unit_cost is numeric NOT NULL'
  union all select 'work_order_materials_unit_price', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_materials' and column_name = 'unit_price' and data_type = 'numeric' and is_nullable = 'NO'), 'WOM unit_price is numeric NOT NULL'
  union all select 'work_order_materials_quote_line_traceability',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_planned_material_decisions' and column_name = 'quote_line_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_planned_material_decisions' and column_name = 'work_order_material_id' and data_type = 'uuid'),
    'quote_line_id trace is stored in planned material decisions and points to WOM'
  union all select 'quote_lines_unit_cost', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quote_lines' and column_name = 'unit_cost' and data_type = 'numeric' and is_nullable = 'NO'), 'quote_lines unit_cost is numeric NOT NULL'
  union all select 'quote_lines_unit_price', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quote_lines' and column_name = 'unit_price' and data_type = 'numeric' and is_nullable = 'NO'), 'quote_lines unit_price is numeric NOT NULL'
  union all select 'quote_lines_material_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quote_lines' and column_name = 'material_id' and data_type = 'uuid'), 'quote_lines material_id is uuid'
  union all select 'quote_lines_quote_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quote_lines' and column_name = 'quote_id' and data_type = 'uuid'), 'quote_lines quote_id is uuid'
  union all select 'materials_cost', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'cost' and data_type = 'numeric' and is_nullable = 'NO'), 'materials cost is numeric NOT NULL'
  union all select 'materials_price', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'price' and data_type = 'numeric' and is_nullable = 'NO'), 'materials price is numeric NOT NULL'
  union all select 'submit_rpc_exists', exists (select 1 from rpc), 'dmp_submit_work_order_material(jsonb) exists'
  union all select 'submit_rpc_security_definer', exists (select 1 from rpc where prosecdef), 'RPC is SECURITY DEFINER'
  union all select 'submit_rpc_search_path', exists (select 1 from rpc r where exists (select 1 from unnest(coalesce(r.proconfig, array[]::text[])) config where config = 'search_path=public')), 'RPC has search_path=public'
  union all select 'submit_rpc_authenticated_grant', has_function_privilege('authenticated', to_regprocedure('public.dmp_submit_work_order_material(jsonb)'), 'EXECUTE'), 'authenticated can execute the RPC'
  union all select 'pre_109_contract_present',
    exists (select 1 from rpc where definition ~* 'v_admin' and definition ~* 'else 0' and definition !~* 'quote_line_id'),
    'pre-109 RPC could leave technician catalog unit_price at zero'
  union all select 'canonical_stock_functions_present',
    to_regprocedure('public.dmp_validate_work_order_material(uuid)') is not null
      and to_regprocedure('public.dmp_refund_work_order_material_stock(uuid,uuid,text)') is not null,
    'canonical validation and refund functions exist'
  union all select 'no_legacy_stock_dependency', not exists (select 1 from rpc where definition ~* 'materials\.stock_quantity'), 'RPC does not reference legacy stock'
  union all select 'no_historical_ledger_dependency', not exists (select 1 from rpc where definition ~* 'material_stock_movements'), 'RPC does not reference historical movement ledger'
)
select jsonb_build_object(
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
