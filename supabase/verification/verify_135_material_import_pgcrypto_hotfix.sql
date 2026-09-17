-- Read-only verification for migration 135.
-- It intentionally returns exactly one result set and performs no writes.
with function_oids as (
  select
    to_regprocedure('public.dmp_import_material_stock(jsonb)') as import_oid,
    to_regprocedure('extensions.digest(bytea,text)') as digest_oid
), function_defs as (
  select coalesce(pg_get_functiondef(import_oid::oid), '') as import_def
  from function_oids
), checks as (
  select 'import function signature' as check_name,
    (select import_oid is not null from function_oids) as passed,
    'exact jsonb signature exists' as detail
  union all select 'security definer and fixed search path',
    exists (select 1 from pg_proc p, function_oids o where p.oid = o.import_oid and p.prosecdef and array_position(p.proconfig, 'search_path=public') is not null),
    'RPC is SECURITY DEFINER with search_path=public'
  union all select 'pgcrypto is installed in extensions',
    exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto' and n.nspname = 'extensions'),
    'pgcrypto extension namespace is extensions'
  union all select 'extensions digest exists',
    (select digest_oid is not null from function_oids),
    'extensions.digest(bytea,text) resolves'
  union all select 'RPC uses extensions digest only',
    (select import_def from function_defs) ilike '%extensions.digest(%'
      and (select import_def from function_defs) not ilike '%public.digest(%',
    'fingerprint uses schema-qualified extensions.digest'
  union all select 'authenticated execute and public/anon denied',
    has_function_privilege('authenticated', 'public.dmp_import_material_stock(jsonb)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_import_material_stock(jsonb)', 'EXECUTE')
      and not exists (select 1 from pg_proc p, function_oids o, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = o.import_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
    'ACL is authenticated-only'
  union all select 'batch table preserved',
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'material_import_batches'),
    'material_import_batches exists'
  union all select 'batch actor and fingerprint columns preserved',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'created_by' and data_type = 'uuid' and is_nullable = 'NO')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_import_batches' and column_name = 'payload_fingerprint' and data_type = 'text' and is_nullable = 'NO')
      and (select import_def from function_defs) ilike '%payload_fingerprint%'
      and (select import_def from function_defs) ilike '%created_by%',
    'batch actor and deterministic fingerprint contract remain'
  union all select 'fingerprint unit semantics preserved',
    position('nullif(trim(item.unit), '''')' in lower((select import_def from function_defs))) > 0
      and position('coalesce(nullif(trim(item.unit), ''''), ''ud'')' in substring(lower((select import_def from function_defs)) from 1 for position('v_fingerprint :=' in lower((select import_def from function_defs))) - 1)) = 0,
    'missing unit remains null and explicit ud remains distinct'
  union all select 'import validation and canonical stock contract preserved',
    (select import_def from function_defs) ilike '%item.quantity <= 0%'
      and (select import_def from function_defs) ilike '%group by lower(trim(item.code))%'
      and (select import_def from function_defs) ilike '%dmp_adjust_warehouse_stock%'
      and position('item.quantity <= 0' in lower((select import_def from function_defs))) < position('insert into public.material_import_batches' in lower((select import_def from function_defs)))
      and position('group by lower(trim(item.code))' in lower((select import_def from function_defs))) < position('insert into public.material_import_batches' in lower((select import_def from function_defs))),
    'positive quantity, duplicate detection and validation-before-mutation remain'
  union all select 'canonical movement and tenant matching preserved',
    (select import_def from function_defs) ilike '%dmp_adjust_warehouse_stock%'
      and position('if not found or v_movement is null' in lower((select import_def from function_defs))) > position('select id into v_movement' in lower((select import_def from function_defs)))
      and position('if not found or v_movement is null' in lower((select import_def from function_defs))) < position('update public.material_import_batches' in lower((select import_def from function_defs)))
      and (select import_def from function_defs) ilike '%company_id = v_company%'
      and (select import_def from function_defs) ilike '%lower(trim(code)) = lower(trim(v_item.code))%',
    'canonical movement is mandatory and tenant-safe matching remains'
  union all select 'deprecated stock quantity absent',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'materials' and column_name = 'stock_quantity')
      and (select import_def from function_defs) not ilike '%materials.stock_quantity%',
    'materials.stock_quantity is absent and unused'
), result as (
  select check_name, passed, detail, 0 as sort_order from checks
  union all
  select 'SUMMARY', bool_and(passed), case when bool_and(passed) then 'PASS' else 'FAIL' end, 1 from checks
)
select check_name, passed, detail
from result
order by sort_order, check_name;
