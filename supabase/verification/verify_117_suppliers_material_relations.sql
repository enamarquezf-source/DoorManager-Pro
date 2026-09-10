-- Strict structural postflight for migration 117. Safe for manual production runs.
do $$
declare
  v_uuid oid := 'uuid'::regtype;
  v_text oid := 'text'::regtype;
  v_bool oid := 'bool'::regtype;
  v_timestamptz oid := 'timestamptz'::regtype;
  v_numeric oid := 'numeric'::regtype;
  v_id smallint;
  v_company_id smallint;
  v_material_id smallint;
  v_supplier_id smallint;
  v_stock_supplier_id smallint;
  v_constraint_exists boolean;
  v_expression text;
begin
  if to_regclass('public.material_suppliers') is null then
    raise exception '117 contract failed: public.material_suppliers is missing';
  end if;

  select attnum into v_id from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'id' and not attisdropped;
  select attnum into v_company_id from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'company_id' and not attisdropped;
  select attnum into v_material_id from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'material_id' and not attisdropped;
  select attnum into v_supplier_id from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'supplier_id' and not attisdropped;

  if v_id is null or not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'id' and atttypid = v_uuid and attnotnull) then
    raise exception '117 contract failed: material_suppliers.id must be uuid primary key';
  end if;
  if v_company_id is null or not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'company_id' and atttypid = v_uuid and attnotnull) then
    raise exception '117 contract failed: company_id must be uuid not null';
  end if;
  if v_material_id is null or not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'material_id' and atttypid = v_uuid and attnotnull) then
    raise exception '117 contract failed: material_id must be uuid not null';
  end if;
  if v_supplier_id is null or not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'supplier_id' and atttypid = v_uuid and attnotnull) then
    raise exception '117 contract failed: supplier_id must be uuid not null';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_suppliers' and column_name = 'supplier_reference' and udt_name = 'text' and is_nullable = 'YES') then
    raise exception '117 contract failed: supplier_reference must be nullable text';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'material_suppliers' and column_name = 'purchase_unit_price' and udt_name = 'numeric' and numeric_precision = 12 and numeric_scale = 2 and is_nullable = 'YES') then
    raise exception '117 contract failed: purchase_unit_price must be nullable numeric(12,2)';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'is_preferred' and atttypid = v_bool and attnotnull) then
    raise exception '117 contract failed: is_preferred must be boolean not null';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'active' and atttypid = v_bool and attnotnull) then
    raise exception '117 contract failed: active must be boolean not null';
  end if;
  for v_constraint_exists in
    select not exists (select 1 from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = t.column_name and atttypid = v_timestamptz and attnotnull)
    from (values ('created_at'), ('updated_at')) as t(column_name)
  loop
    if v_constraint_exists then raise exception '117 contract failed: timestamps must be timestamptz not null'; end if;
  end loop;

  if to_regclass('public.suppliers') is null or to_regclass('public.materials') is null then
    raise exception '117 contract failed: parent table is missing';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.suppliers'::regclass and c.contype in ('p','u') and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'company_id'), (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'id')]::smallint[]) then
    raise exception '117 contract failed: suppliers(company_id,id) is not unique';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.materials'::regclass and c.contype in ('p','u') and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'company_id'), (select attnum from pg_attribute where attrelid = c.conrelid and attname = 'id')]::smallint[]) then
    raise exception '117 contract failed: materials(company_id,id) is not unique';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.material_suppliers'::regclass and contype = 'f' and conkey = array[v_company_id, v_material_id]::smallint[] and confrelid = 'public.materials'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.materials'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.materials'::regclass and attname = 'id')]::smallint[]) then
    raise exception '117 contract failed: material company-scoped foreign key is missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.material_suppliers'::regclass and contype = 'f' and conkey = array[v_company_id, v_supplier_id]::smallint[] and confrelid = 'public.suppliers'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.suppliers'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.suppliers'::regclass and attname = 'id')]::smallint[]) then
    raise exception '117 contract failed: supplier company-scoped foreign key is missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.material_suppliers'::regclass and contype = 'u' and conkey = array[v_company_id, v_material_id, v_supplier_id]::smallint[]) then
    raise exception '117 contract failed: relation uniqueness is missing';
  end if;
  if not exists (
    select 1
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as k(attnum, column_position)
    where i.indrelid = 'public.material_suppliers'::regclass
      and i.indisunique
      and i.indpred is not null
    group by i.indexrelid, i.indpred, i.indrelid
    having array_agg(k.attnum order by k.column_position) = array[v_company_id, v_material_id]::smallint[]
       and replace(replace(replace(replace(lower(pg_get_expr(i.indpred, i.indrelid)), ' ', ''), '(', ''), ')', ''), '=true', '') in ('is_preferredandactive', 'activeandis_preferred')
  ) then
    raise exception '117 contract failed: preferred active unique index is missing';
  end if;

  if not exists (select 1 from pg_class where oid = 'public.suppliers'::regclass and relrowsecurity) or not exists (select 1 from pg_class where oid = 'public.material_suppliers'::regclass and relrowsecurity) then
    raise exception '117 contract failed: RLS must be enabled on both tables';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('suppliers','material_suppliers') and cmd = 'DELETE') then
    raise exception '117 contract failed: supplier catalog DELETE policy exists';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppliers' and policyname not in ('suppliers_select_backoffice','suppliers_insert_backoffice','suppliers_update_backoffice','suppliers_platform_superadmin_select','suppliers_platform_superadmin_insert','suppliers_platform_superadmin_update')) then
    raise exception '117 contract failed: unexpected suppliers policy broadens the contract';
  end if;
  for v_constraint_exists in
    select not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name and p.policyname = t.policy_name and p.cmd = t.policy_cmd and p.roles @> array['authenticated']::name[])
    from (values
      ('suppliers','suppliers_select_backoffice','SELECT'), ('suppliers','suppliers_insert_backoffice','INSERT'), ('suppliers','suppliers_update_backoffice','UPDATE'),
      ('material_suppliers','material_suppliers_select_backoffice','SELECT'), ('material_suppliers','material_suppliers_insert_backoffice','INSERT'), ('material_suppliers','material_suppliers_update_backoffice','UPDATE')) as t(table_name, policy_name, policy_cmd)
  loop
    if v_constraint_exists then raise exception '117 contract failed: required policy is missing'; end if;
  end loop;
  for v_constraint_exists, v_expression in
    select false, ''
    from pg_policies p
    where p.schemaname = 'public'
      and p.policyname in ('suppliers_select_backoffice','suppliers_insert_backoffice','suppliers_update_backoffice','material_suppliers_select_backoffice','material_suppliers_insert_backoffice','material_suppliers_update_backoffice')
      and (
        (p.cmd in ('SELECT','UPDATE') and not (
          position('company_id' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('current_company_id' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('has_any_role' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('superadmin' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('sat' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('gerencia' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('oficina' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position(' or ' in lower(regexp_replace(replace(coalesce(p.qual,''), 'public.', ''), '\s+', ' ', 'g'))) = 0
        ))
        or (p.cmd in ('INSERT','UPDATE') and not (
          position('company_id' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('current_company_id' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('has_any_role' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('superadmin' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('sat' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('gerencia' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position('oficina' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) > 0
          and position(' or ' in lower(regexp_replace(replace(coalesce(p.with_check,''), 'public.', ''), '\s+', ' ', 'g'))) = 0
        ))
      )
  loop
    raise exception '117 contract failed: required policy scope is invalid';
  end loop;
  select lower(regexp_replace(replace(coalesce(qual,''), 'public.', ''), '\s+', ' ', 'g')) into v_expression from pg_policies where schemaname = 'public' and policyname = 'suppliers_select_backoffice';
  if position('deleted_at' in v_expression) = 0 or position(' is null' in v_expression) = 0 then
    raise exception '117 contract failed: suppliers SELECT must exclude deleted rows';
  end if;
  for v_constraint_exists in
    select not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name and p.policyname = t.policy_name and p.cmd = t.policy_cmd and p.roles @> array['authenticated']::name[])
    from (values
      ('suppliers','suppliers_platform_superadmin_select','SELECT'), ('suppliers','suppliers_platform_superadmin_insert','INSERT'), ('suppliers','suppliers_platform_superadmin_update','UPDATE'),
      ('material_suppliers','material_suppliers_platform_superadmin_select','SELECT'), ('material_suppliers','material_suppliers_platform_superadmin_insert','INSERT'), ('material_suppliers','material_suppliers_platform_superadmin_update','UPDATE')) as t(table_name, policy_name, policy_cmd)
  loop
    if v_constraint_exists then raise exception '117 contract failed: platform superadmin policy is missing'; end if;
  end loop;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.policyname in ('suppliers_platform_superadmin_select','material_suppliers_platform_superadmin_select') and position('is_platform_superadmin' in lower(coalesce(p.qual,''))) = 0) then
    raise exception '117 contract failed: platform SELECT policy is invalid';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.policyname in ('suppliers_platform_superadmin_insert','material_suppliers_platform_superadmin_insert') and position('is_platform_superadmin' in lower(coalesce(p.with_check,''))) = 0) then
    raise exception '117 contract failed: platform INSERT policy is invalid';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.policyname in ('suppliers_platform_superadmin_update','material_suppliers_platform_superadmin_update') and (position('is_platform_superadmin' in lower(coalesce(p.qual,''))) = 0 or position('is_platform_superadmin' in lower(coalesce(p.with_check,''))) = 0)) then
    raise exception '117 contract failed: platform UPDATE policy is invalid';
  end if;
  if exists (select 1 from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name in ('suppliers','material_suppliers') and privilege_type = 'DELETE') then
    raise exception '117 contract failed: authenticated has DELETE grant';
  end if;
  for v_constraint_exists in
    select not exists (select 1 from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = t.table_name and privilege_type = t.privilege_type)
    from (values ('suppliers','SELECT'),('suppliers','INSERT'),('suppliers','UPDATE'),('material_suppliers','SELECT'),('material_suppliers','INSERT'),('material_suppliers','UPDATE')) as t(table_name, privilege_type)
  loop
    if v_constraint_exists then raise exception '117 contract failed: required authenticated grant is missing'; end if;
  end loop;

  select attnum into v_stock_supplier_id from pg_attribute where attrelid = 'public.stock_movements'::regclass and attname = 'supplier_id' and not attisdropped;
  if v_stock_supplier_id is null or not exists (select 1 from pg_attribute where attrelid = 'public.stock_movements'::regclass and attname = 'supplier_id' and atttypid = v_uuid and not attnotnull) then
    raise exception '117 contract failed: stock_movements.supplier_id must be nullable uuid';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.stock_movements'::regclass and contype = 'f' and conkey = array[v_stock_supplier_id]::smallint[] and confrelid = 'public.suppliers'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.suppliers'::regclass and attname = 'id')]::smallint[]) then
    raise exception '117 contract failed: stock_movements.supplier_id foreign key is missing';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'current_company_id' and pronargs = 0 and prorettype = v_uuid) then
    raise exception '117 contract failed: current_company_id() signature is missing';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'has_any_role' and pronargs = 1 and proargtypes[0] = 'text[]'::regtype::oid and prorettype = 'bool'::regtype) then
    raise exception '117 contract failed: has_any_role(text[]) signature is missing';
  end if;
end;
$$;

select 'verify_117_suppliers_material_relations: PASS' as result;
