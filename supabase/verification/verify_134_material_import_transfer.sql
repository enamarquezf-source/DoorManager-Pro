-- Read-only verification for migration 134.
-- It intentionally returns exactly one result set and performs no writes.
with function_oids as (
  select
    to_regprocedure('public.dmp_import_material_stock(jsonb)') as import_oid,
    to_regprocedure('public.dmp_transfer_warehouse_stock(uuid,uuid,uuid,numeric,text,text)') as transfer_oid,
    to_regprocedure('public.digest(bytea,text)') as digest_oid
), function_defs as (
  select
    coalesce(pg_get_functiondef(import_oid::oid), '') as import_def,
    coalesce(pg_get_functiondef(transfer_oid::oid), '') as transfer_def
  from function_oids
), catalog as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'material_import_batches') as batch_exists,
    exists (select 1 from pg_class r join pg_namespace n on n.oid = r.relnamespace where n.nspname = 'public' and r.relname = 'material_import_batches' and r.relrowsecurity) as batch_rls,
    exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto' and n.nspname = 'public') as pgcrypto_public,
    (select digest_oid is not null from function_oids) as public_digest,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'transfer_group_id' and udt_name = 'uuid') as transfer_group_column,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity') as deprecated_stock_quantity
), checks as (
  select 'import function signature' as check_name,
    (select import_oid is not null from function_oids) as passed,
    'exact jsonb signature exists' as detail
  union all select 'transfer function signature',
    (select transfer_oid is not null from function_oids),
    'exact transfer signature exists'
  union all select 'security definer and fixed search path',
    exists (select 1 from pg_proc p, function_oids o where p.oid = o.import_oid and p.prosecdef and array_position(p.proconfig, 'search_path=public') is not null)
      and exists (select 1 from pg_proc p, function_oids o where p.oid = o.transfer_oid and p.prosecdef and array_position(p.proconfig, 'search_path=public') is not null),
    'both functions are SECURITY DEFINER with search_path=public'
  union all select 'authenticated execute and public/anon denied',
    has_function_privilege('authenticated', 'public.dmp_import_material_stock(jsonb)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_transfer_warehouse_stock(uuid,uuid,uuid,numeric,text,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_import_material_stock(jsonb)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_transfer_warehouse_stock(uuid,uuid,uuid,numeric,text,text)', 'EXECUTE')
      and not exists (select 1 from pg_proc p, function_oids o, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid in (o.import_oid, o.transfer_oid) and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'ACL is authenticated-only'
  union all select 'pgcrypto digest namespace and RPC reference',
    (select pgcrypto_public from catalog)
      and (select public_digest from catalog)
      and (select import_def from function_defs) ilike '%public.digest(%',
    'pgcrypto and public.digest are available with fixed search_path'
  union all select 'canonical stock tables and no deprecated quantity',
    (select import_def from function_defs) ilike '%warehouse_stock%'
      and (select import_def from function_defs) ilike '%stock_movements%'
      and (select transfer_def from function_defs) ilike '%warehouse_stock%'
      and (select transfer_def from function_defs) ilike '%stock_movements%'
      and not (select deprecated_stock_quantity from catalog)
      and (select import_def || transfer_def from function_defs) not ilike '%materials.stock_quantity%',
    'functions use warehouse_stock and stock_movements only'
  union all select 'import validation precedes mutation',
    position('item.quantity <= 0' in lower((select import_def from function_defs))) > 0
      and position('group by lower(trim(item.code))' in lower((select import_def from function_defs))) > 0
      and position('item.quantity <= 0' in lower((select import_def from function_defs))) < position('insert into public.material_import_batches' in lower((select import_def from function_defs)))
      and position('group by lower(trim(item.code))' in lower((select import_def from function_defs))) < position('insert into public.material_import_batches' in lower((select import_def from function_defs)))
      and position('item.quantity <= 0' in lower((select import_def from function_defs))) < position('insert into public.materials' in lower((select import_def from function_defs))),
    'quantity and duplicate validation occur before batch/material mutation'
  union all select 'import tenant-safe warehouse and material matching',
    (select import_def from function_defs) ilike '%company_id = v_company%'
      and (select import_def from function_defs) ilike '%warehouses%active%deleted_at is null%'
      and (select import_def from function_defs) ilike '%lower(trim(code)) = lower(trim(v_item.code))%',
    'warehouse and material are scoped to current company'
  union all select 'import idempotency has no wildcard lookup',
    (select import_def from function_defs) not ilike '% like %'
      and (select import_def from function_defs) ilike '%payload_fingerprint%'
      and (select import_def from function_defs) ilike '%material_import_batches%',
    'exact batch key plus deterministic fingerprint'
  union all select 'import fingerprint preserves unit semantics',
    position('nullif(trim(item.unit), '''')' in lower((select import_def from function_defs))) > 0
      and position('coalesce(nullif(trim(item.unit), ''''), ''ud'')' in substring(lower((select import_def from function_defs)) from 1 for position('v_fingerprint :=' in lower((select import_def from function_defs))) - 1)) = 0,
    'missing unit is null and explicit ud remains distinct in the fingerprint'
  union all select 'import delegates canonical ledger update',
    (select import_def from function_defs) ilike '%dmp_adjust_warehouse_stock%'
      and (select import_def from function_defs) ilike '%idempotency_key%',
    'canonical stock helper and idempotency key are used'
  union all select 'canonical import movement is mandatory',
    position('select id into v_movement' in lower((select import_def from function_defs))) > 0
      and position('if not found or v_movement is null' in lower((select import_def from function_defs))) > position('select id into v_movement' in lower((select import_def from function_defs)))
      and position('if not found or v_movement is null' in lower((select import_def from function_defs))) < position('update public.material_import_batches' in lower((select import_def from function_defs))),
    'missing canonical movement raises before batch completion'
  union all select 'transfer source/destination and quantity guards',
    (select transfer_def from function_defs) ilike '%p_source_warehouse_id = p_destination_warehouse_id%'
      and (select transfer_def from function_defs) ilike '%p_quantity <= 0%'
      and (select transfer_def from function_defs) ilike '%if v_source.quantity < p_quantity then%',
    'same warehouse, positive quantity and unconditional sufficiency checks'
  union all select 'transfer does not bypass with allow_negative_stock',
    (select transfer_def from function_defs) not ilike '%allow_negative_stock%',
    'transfer rejects insufficient source stock unconditionally'
  union all select 'transfer operation advisory lock precedes lookup',
    position('pg_advisory_xact_lock' in lower((select transfer_def from function_defs))) > 0
      and position('pg_advisory_xact_lock' in lower((select transfer_def from function_defs))) < position('select * into v_existing_out' in lower((select transfer_def from function_defs))),
    'same-key transfer retries are serialized before idempotency lookup'
  union all select 'transfer both partial states are rejected',
    (select transfer_def from function_defs) ilike '%v_existing_out.id is not null and v_existing_in.id is null%'
      and (select transfer_def from function_defs) ilike '%v_existing_out.id is null and v_existing_in.id is not null%'
      and (select transfer_def from function_defs) ilike '%transferencia previa incompleta%',
    'out-only and in-only states are explicitly rejected'
  union all select 'transfer complete pair and parameter conflict checks',
    (select transfer_def from function_defs) ilike '%v_existing_in%'
      and (select transfer_def from function_defs) ilike '%ya se uso para otra transferencia%',
    'both legs and material/warehouse/quantity/reason/group mismatch are checked'
  union all select 'transfer deterministic stock locks',
    (select transfer_def from function_defs) ilike '%order by warehouse_id for update%',
    'both warehouse_stock rows are locked in warehouse order'
  union all select 'transfer ledger pair and shared identity',
    (select transfer_def from function_defs) ilike '%''salida''%'
      and (select transfer_def from function_defs) ilike '%''entrada''%'
      and (select transfer_def from function_defs) ilike '%transfer_group_id%',
    'source and destination legs share transfer_group_id'
  union all select 'transfer_group column and index',
    (select transfer_group_column from catalog)
      and exists (select 1 from pg_index i join pg_class idx on idx.oid = i.indexrelid join pg_class tbl on tbl.oid = i.indrelid join pg_namespace n on n.oid = tbl.relnamespace where n.nspname = 'public' and tbl.relname = 'stock_movements' and pg_get_indexdef(i.indexrelid) ~* 'company_id.*transfer_group_id' and pg_get_expr(i.indpred, i.indrelid) ~* 'transfer_group_id.*is not null'),
    'transfer_group_id is uuid and indexed with the required predicate'
  union all select 'transfer source and destination are active tenant warehouses',
    (select transfer_def from function_defs) ilike '%company_id = v_company and active and deleted_at is null%',
    'warehouse validation is tenant-safe'
  union all select 'batch schema contract',
    (select batch_exists from catalog)
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'id' and data_type = 'uuid' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'company_id' and data_type = 'uuid' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'warehouse_id' and data_type = 'uuid' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'idempotency_key' and data_type = 'text' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'payload_fingerprint' and data_type = 'text' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'item_count' and data_type = 'integer' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'status' and data_type = 'text' and is_nullable = 'NO' and column_default like '''pending''%')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'first_movement_id' and data_type = 'uuid')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'created_by' and data_type = 'uuid' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'created_at' and data_type = 'timestamp with time zone' and is_nullable = 'NO')
      and exists (select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace where n.nspname = 'public' and r.relname = 'material_import_batches' and c.contype = 'p' and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)')
      and exists (select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace where n.nspname = 'public' and r.relname = 'material_import_batches' and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%item_count > 0%')
      and exists (select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace where n.nspname = 'public' and r.relname = 'material_import_batches' and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%status%pending%completed%')
      and exists (select 1 from pg_constraint c join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace where n.nspname = 'public' and r.relname = 'material_import_batches' and c.contype = 'u' and pg_get_constraintdef(c.oid) ilike '%company_id%idempotency_key%'),
    'batch columns, primary key, foreign keys, checks, unique key and actor column exist'
  union all select 'batch foreign keys and ACL',
    (select batch_rls from catalog)
      and not has_table_privilege('authenticated', 'public.material_import_batches', 'SELECT')
      and not has_table_privilege('anon', 'public.material_import_batches', 'SELECT')
      and not exists (select 1 from pg_class r join pg_namespace n on n.oid = r.relnamespace, lateral aclexplode(coalesce(r.relacl, acldefault('r', r.relowner))) a where n.nspname = 'public' and r.relname = 'material_import_batches' and a.grantee = 0 and a.privilege_type <> 'REFERENCES')
      and exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema where tc.table_schema = 'public' and tc.table_name = 'material_import_batches' and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'company_id' and ccu.table_name = 'companies' and ccu.column_name = 'id')
      and exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema where tc.table_schema = 'public' and tc.table_name = 'material_import_batches' and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'warehouse_id' and ccu.table_name = 'warehouses' and ccu.column_name = 'id')
      and exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema where tc.table_schema = 'public' and tc.table_name = 'material_import_batches' and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'first_movement_id' and ccu.table_name = 'stock_movements' and ccu.column_name = 'id')
      and exists (select 1 from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema where tc.table_schema = 'public' and tc.table_name = 'material_import_batches' and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'created_by' and ccu.table_name = 'profiles' and ccu.column_name = 'id'),
    'RLS enabled, direct access denied and relevant foreign keys exist'
  union all select 'materials case-insensitive unique code index',
    exists (select 1 from pg_index i join pg_class tbl on tbl.oid = i.indrelid join pg_namespace n on n.oid = tbl.relnamespace where n.nspname = 'public' and tbl.relname = 'materials' and i.indisunique and pg_get_indexdef(i.indexrelid) ~* 'company_id.*lower.*trim.*code'),
    'unique index structurally covers company_id and lower(trim(code))'
  union all select 'materials stock_quantity absent',
    not (select deprecated_stock_quantity from catalog),
    'deprecated materials.stock_quantity is absent'
), result as (
  select check_name, passed, detail, 0 as sort_order from checks
  union all
  select 'SUMMARY', bool_and(passed), case when bool_and(passed) then 'PASS' else 'FAIL' end, 1 from checks
)
select check_name, passed, detail
from result
order by sort_order, check_name;
