-- Read-only postflight for 094. No RPC is invoked and no data is mutated.
-- One homogeneous result set: check_group, check_name, observed_value, result.
with checks(check_group, check_name, observed_value, result) as (
  select 'schema', 'base tables',
         concat(to_regclass('public.warehouse_stock'), ' / ', to_regclass('public.stock_movements')),
         case when to_regclass('public.warehouse_stock') is not null
                    and to_regclass('public.stock_movements') is not null
              then 'OK' else 'BLOCKER' end

  union all

  select 'columns', x.table_name || '.' || x.column_name,
         count(c.column_name)::text,
         case when count(c.column_name) = 1 then 'OK' else 'BLOCKER' end
  from (values
    ('work_order_materials', 'stock_validation_status'),
    ('work_order_materials', 'stock_warehouse_id'),
    ('work_order_materials', 'stock_validated_at'),
    ('work_order_materials', 'stock_validated_by'),
    ('work_order_materials', 'stock_movement_id'),
    ('stock_movements', 'work_order_material_id'),
    ('stock_movements', 'idempotency_key')
  ) as x(table_name, column_name)
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = x.table_name and c.column_name = x.column_name
  group by x.table_name, x.column_name

  union all

  select 'constraint', 'work_order_materials_stock_validation_status_check',
         coalesce(pg_get_constraintdef(con.oid), 'MISSING'),
         case when pg_get_constraintdef(con.oid) is not null
                    and regexp_replace(regexp_replace(lower(pg_get_constraintdef(con.oid)), '::text', '', 'g'), '[()\s]', '', 'g') = 'checkstock_validation_status=anyarray[''pending'',''validated'',''rejected'']'
              then 'OK / exact allowed values inspected' else 'BLOCKER' end
  from (select to_regclass('public.work_order_materials') as table_oid) t
  left join pg_constraint con
    on con.conrelid = t.table_oid
   and con.conname = 'work_order_materials_stock_validation_status_check'

  union all

  select 'indexes', x.index_name,
         coalesce(pg_get_indexdef(i.indexrelid), 'MISSING'),
         case when i.indexrelid is not null
                    and i.indisunique = x.expected_unique
                    and pg_get_indexdef(i.indexrelid) ~* x.expected_columns
              then 'OK' else 'BLOCKER' end
  from (values
    ('stock_movements_company_idempotency_key', true, 'stock_movements.*company_id.*idempotency_key'),
    ('stock_movements_work_order_material_once', true, 'stock_movements.*work_order_material_id'),
    ('work_order_materials_pending_stock_idx', false, 'work_order_materials.*company_id.*stock_validation_status')
  ) as x(index_name, expected_unique, expected_columns)
  left join pg_class ic on ic.relname = x.index_name and ic.relnamespace = 'public'::regnamespace
  left join pg_index i on i.indexrelid = ic.oid

  union all

  select 'rpc', x.signature,
         coalesce(to_regprocedure(x.signature)::text, 'MISSING'),
         case when to_regprocedure(x.signature) is not null then 'OK / exact signature' else 'BLOCKER' end
  from (values
    ('public.dmp_submit_work_order_material(jsonb)'),
    ('public.dmp_validate_work_order_material(uuid)'),
    ('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')
  ) as x(signature)

  union all

  select 'rpc_security', x.function_name,
         concat('security_definer=', p.prosecdef, '; search_path=', coalesce(array_to_string(p.proconfig, ','), 'default')),
         case when p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%'
              then 'OK' else 'REVIEW / inspect function security' end
  from (values
    ('dmp_submit_work_order_material', 'public.dmp_submit_work_order_material(jsonb)'),
    ('dmp_validate_work_order_material', 'public.dmp_validate_work_order_material(uuid)'),
    ('dmp_set_initial_warehouse_stock', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')
  ) as x(function_name, signature)
  left join pg_proc p on p.oid = to_regprocedure(x.signature)

  union all

  select 'grants', x.function_name || ' authenticated execute',
         has_function_privilege('authenticated', x.signature, 'EXECUTE')::text,
         case when x.expected_authenticated = has_function_privilege('authenticated', x.signature, 'EXECUTE') then 'OK' else 'BLOCKER' end
  from (values
    ('dmp_submit_work_order_material', 'public.dmp_submit_work_order_material(jsonb)', true),
    ('dmp_validate_work_order_material', 'public.dmp_validate_work_order_material(uuid)', true),
    ('dmp_set_initial_warehouse_stock', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', true),
    ('dmp_upsert_work_order_material legacy', 'public.dmp_upsert_work_order_material(jsonb)', false)
  ) as x(function_name, signature, expected_authenticated)

  union all

  select 'grants', x.function_name || ' public/anon execute',
         concat(has_function_privilege('public', x.signature, 'EXECUTE'), ' / ', has_function_privilege('anon', x.signature, 'EXECUTE')),
         case when not has_function_privilege('public', x.signature, 'EXECUTE')
                    and not has_function_privilege('anon', x.signature, 'EXECUTE')
              then 'OK' else 'BLOCKER' end
  from (values
    ('dmp_validate_work_order_material', 'public.dmp_validate_work_order_material(uuid)'),
    ('dmp_set_initial_warehouse_stock', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)'),
    ('dmp_upsert_work_order_material legacy', 'public.dmp_upsert_work_order_material(jsonb)')
  ) as x(function_name, signature)

  union all

  select 'role_guards', 'dmp_validate_work_order_material',
         case when pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]\)$$ then 'SAT,Oficina,Gerencia,superadmin' else 'guard not found' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]\)$$ then 'OK' else 'BLOCKER' end

  union all

  select 'role_guards', 'dmp_set_initial_warehouse_stock',
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]\)$$
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) !~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]\)$$
              then 'Oficina,Gerencia,superadmin; SAT absent' else 'guard not found or SAT present' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]\)$$
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) !~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]\)$$
              then 'OK' else 'BLOCKER' end

  union all

  select 'historical_rows', 'work_order_materials_current_rows', count(*)::text,
         case when count(*) = 28 then 'OK / baseline preserved' else 'REVIEW / baseline differs' end
  from public.work_order_materials
  where deleted_at is null

  union all

  select 'historical_rows', 'work_order_materials_catalogue_rows', count(*)::text,
         case when count(*) = 25 then 'OK / baseline preserved' else 'REVIEW / baseline differs' end
  from public.work_order_materials
  where deleted_at is null and material_id is not null and used_quantity > 0

  union all

  select 'historical_rows', 'status_distribution',
         coalesce(string_agg(stock_validation_status || '=' || rows, ', ' order by stock_validation_status), 'none'),
         case when count(*) filter (where stock_validation_status = 'pending') = 0 then 'OK / no historical pending rows' else 'REVIEW / pending rows require classification' end
  from (select stock_validation_status, count(*) as rows from public.work_order_materials where deleted_at is null group by stock_validation_status) s

  union all

  select 'historical_rows', 'historical_new_movement_links', count(*)::text,
         case when count(*) = 0 then 'OK / no retroactive links' else 'REVIEW / links exist' end
  from public.work_order_materials
  where stock_validated_at is not null and stock_movement_id is not null

  union all

  select 'pending', 'pending_with_deduction', count(*)::text,
         case when count(*) = 0 then 'OK' else 'BLOCKER' end
  from public.work_order_materials
  where stock_validation_status = 'pending' and stock_deducted_quantity <> 0

  union all

  select 'warehouse_stock', 'known_legacy_mismatch_materials',
         coalesce(string_agg(m.code || '=' || m.stock_quantity || '/' || coalesce(ws.quantity, 0), ', ' order by m.code), 'none'),
         case when count(*) = 3 then 'OK / known mismatches preserved' else 'BLOCKER / legacy values changed or missing' end
  from public.materials m
  left join (select material_id, sum(quantity) as quantity from public.warehouse_stock group by material_id) ws on ws.material_id = m.id
  where m.code = any(array['MAT-CAB-001', 'MAT-CON-001', 'MAT-FOT-001'])
    and m.stock_quantity = case m.code when 'MAT-CAB-001' then 275 when 'MAT-CON-001' then 10 when 'MAT-FOT-001' then 4 end
    and coalesce(ws.quantity, 0) = case m.code when 'MAT-CAB-001' then 120 when 'MAT-CON-001' then 3 when 'MAT-FOT-001' then 6 end

  union all

  select 'warehouse_stock', 'legacy_stock_column_and_known_values',
         coalesce(string_agg(m.code || '=' || m.stock_quantity, ', ' order by m.code), 'none'),
         case when count(*) = 3 then 'OK' else 'BLOCKER' end
  from public.materials m
  where m.code = any(array['MAT-CAB-001', 'MAT-CON-001', 'MAT-FOT-001'])
    and m.stock_quantity = case m.code when 'MAT-CAB-001' then 275 when 'MAT-CON-001' then 10 when 'MAT-FOT-001' then 4 end

  union all

  select 'movements', 'work_order_material_links', count(*)::text, 'OK / current links shown'
  from public.stock_movements where work_order_material_id is not null

  union all

  select 'movements', 'idempotency_key_links', count(*)::text, 'OK / current keys shown'
  from public.stock_movements where idempotency_key is not null

  union all

  select 'duplicates', 'work_order_material_id', coalesce(sum(duplicate_count), 0)::text,
         case when coalesce(sum(duplicate_count), 0) = 0 then 'OK' else 'BLOCKER' end
  from (select count(*) - 1 as duplicate_count from public.stock_movements where work_order_material_id is not null group by work_order_material_id having count(*) > 1) d

  union all

  select 'duplicates', 'company_id_idempotency_key', coalesce(sum(duplicate_count), 0)::text,
         case when coalesce(sum(duplicate_count), 0) = 0 then 'OK' else 'BLOCKER' end
  from (select count(*) - 1 as duplicate_count from public.stock_movements where idempotency_key is not null group by company_id, idempotency_key having count(*) > 1) d

  union all

  select 'orphans', 'stock_movement_id', count(*)::text,
         case when count(*) = 0 then 'OK' else 'BLOCKER' end
  from public.work_order_materials wom
  left join public.stock_movements sm on sm.id = wom.stock_movement_id
  where wom.stock_movement_id is not null and sm.id is null

  union all

  select 'orphans', 'stock_warehouse_id', count(*)::text,
         case when count(*) = 0 then 'OK' else 'BLOCKER' end
  from public.work_order_materials wom
  left join public.warehouses w on w.id = wom.stock_warehouse_id
  where wom.stock_warehouse_id is not null and w.id is null

  union all

  select 'orphans', 'stock_movements.work_order_material_id', count(*)::text,
         case when count(*) = 0 then 'OK' else 'BLOCKER' end
  from public.stock_movements sm
  left join public.work_order_materials wom on wom.id = sm.work_order_material_id
  where sm.work_order_material_id is not null and wom.id is null

  union all

  select 'orphans', 'stock_validated_by', count(*)::text,
         case when count(*) = 0 then 'OK' else 'BLOCKER' end
  from public.work_order_materials wom
  left join public.profiles p on p.id = wom.stock_validated_by
  where wom.stock_validated_by is not null and p.id is null

  union all

  select 'initial_balance', 'initial/opening movements', count(*)::text,
         case when count(*) = 0 then 'OK / no automatic opening detected' else 'REVIEW / classify origin' end
  from public.stock_movements
  where lower(coalesce(idempotency_key, '')) like 'initial:%'
     or upper(movement_type) in ('INITIAL', 'INITIAL_BALANCE')

  union all

  select 'tenant', 'validate company/warehouse guards',
         case when pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~ 'v_usage\.company_id'
                    and pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~ 'v_usage\.stock_warehouse_id'
              then 'company-scoped usage and warehouse lookup present' else 'guard not visible' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~ 'v_usage\.company_id'
                    and pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~ 'v_usage\.stock_warehouse_id'
              then 'OK' else 'REVIEW' end
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
