-- Structural verification for migration 122. Read-only.
do $$
declare
  v_material oid;
  v_create oid;
  v_stock oid;
  v_definition text;
  v_stock_definition text;
begin
  select c.oid into v_material
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'materials' and c.relkind = 'r';
  if v_material is null then raise exception '122 contract failed: materials table missing'; end if;
  foreach v_definition in array array['made_to_measure','single_use','is_specific'] loop
    if not exists (select 1 from pg_attribute where attrelid = v_material and attname = v_definition and atttypid = 'boolean'::regtype and attnotnull and not attisdropped) then raise exception '122 contract failed: material flag %', v_definition; end if;
  end loop;
  foreach v_definition in array array['made_to_measure','single_use'] loop
    if not exists (
      select 1 from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = v_material and a.attname = v_definition
        and lower(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '[[:space:]()]', '', 'g')) in ('false','false::boolean')
    ) then raise exception '122 contract failed: default false for %', v_definition; end if;
  end loop;
  if to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)') is null then raise exception '122 contract failed: canonical stock function missing'; end if;
  v_stock := to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)');
  if not exists (select 1 from pg_proc p where p.oid = v_stock and p.prosecdef and p.proconfig @> array['search_path=public']) then raise exception '122 contract failed: canonical stock security definer/search_path'; end if;
  if not has_function_privilege('authenticated', v_stock, 'EXECUTE') or has_function_privilege('anon', v_stock, 'EXECUTE') then raise exception '122 contract failed: canonical stock ACL'; end if;
  if exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid = v_stock), acldefault('f', (select proowner from pg_proc where oid = v_stock)))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then raise exception '122 contract failed: canonical stock PUBLIC execute ACL'; end if;
  select lower(pg_get_functiondef(v_stock)) into v_stock_definition;
  if v_stock_definition !~* 'v_existing\.movement_type\s*<>\s*p_movement_type' or v_stock_definition !~* 'v_existing\.quantity\s*<>\s*p_quantity' then raise exception '122 contract failed: canonical stock idempotency validation'; end if;
  if v_stock_definition !~* 'is_platform_superadmin\s*\(\)' then raise exception '122 contract failed: platform superadmin stock contract'; end if;
  if v_stock_definition !~* 'insert\s+into\s+public\.warehouse_stock' or v_stock_definition !~* 'on\s+conflict' then raise exception '122 contract failed: safe warehouse stock open'; end if;
  if v_stock_definition !~* 'v_new\s*<\s*0' or v_stock_definition !~* 'allow_negative_stock' then raise exception '122 contract failed: negative stock protection'; end if;
  if v_stock_definition !~* 'insert\s+into\s+public\.stock_movements' then raise exception '122 contract failed: stock movement insert'; end if;
  select p.oid into v_create from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'dmp_create_material_with_stock' and p.pronargs = 1 and p.proargtypes[0] = 'jsonb'::regtype and p.prorettype = 'public.materials'::regtype;
  if v_create is null then raise exception '122 contract failed: material creation RPC'; end if;
  if not exists (select 1 from pg_proc p where p.oid = v_create and p.prosecdef and p.proconfig @> array['search_path=public']) then raise exception '122 contract failed: material creation security definer/search_path'; end if;
  if not has_function_privilege('authenticated', v_create, 'EXECUTE') or has_function_privilege('anon', v_create, 'EXECUTE') then raise exception '122 contract failed: material creation ACL'; end if;
  if exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid = v_create), acldefault('f', (select proowner from pg_proc where oid = v_create)))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then raise exception '122 contract failed: material creation PUBLIC execute ACL'; end if;
  select lower(pg_get_functiondef(v_create)) into v_definition;
  if position('perform public.dmp_adjust_warehouse_stock' in v_definition) = 0 then raise exception '122 contract failed: canonical stock call'; end if;
  if position('insert into public.warehouse_stock' in v_definition) > 0 or position('insert into public.stock_movements' in v_definition) > 0 then raise exception '122 contract failed: direct stock write in creation RPC'; end if;
  if position('code = ''alm-central''' in v_definition) > 0 or position('alm-central' in v_definition) > 0 then raise exception '122 contract failed: implicit central warehouse fallback'; end if;
  if position('if v_warehouse is null then raise exception ''stock: selecciona un almacen para el stock inicial''' in v_definition) = 0 then raise exception '122 contract failed: explicit initial warehouse'; end if;
  if v_definition !~* 'insert into public\.materials\s*\([^)]*is_specific\s*,\s*made_to_measure\s*,\s*single_use\s*,\s*active' or position('p_payload->>''made_to_measure''' in v_definition) = 0 or position('p_payload->>''single_use''' in v_definition) = 0 then raise exception '122 contract failed: independent material flags insert'; end if;
end;
$$;
select 'verify_122_material_flags: PASS' as result;
