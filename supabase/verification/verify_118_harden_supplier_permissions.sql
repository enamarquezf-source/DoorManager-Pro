-- Strict structural postflight for migration 118. Safe for manual production runs.
do $$
declare
  v_table text;
  v_privilege text;
  v_expression text;
  v_policy_exists boolean;
begin
  foreach v_table in array array['suppliers','material_suppliers'] loop
    if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = v_table and grantee = 'anon') then
      raise exception '118 contract failed: anon has a privilege on public.%', v_table;
    end if;
    if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = v_table and grantee = 'authenticated' and privilege_type in ('DELETE','TRUNCATE','REFERENCES','TRIGGER')) then
      raise exception '118 contract failed: authenticated has a forbidden privilege on public.%', v_table;
    end if;
    foreach v_privilege in array array['SELECT','INSERT','UPDATE'] loop
      if not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = v_table and grantee = 'authenticated' and privilege_type = v_privilege) then
        raise exception '118 contract failed: authenticated lacks % on public.%', v_privilege, v_table;
      end if;
    end loop;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('suppliers','material_suppliers') and cmd = 'DELETE') then
    raise exception '118 contract failed: supplier catalog DELETE policy exists';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('suppliers','material_suppliers') and policyname not in (
    'suppliers_select_backoffice','suppliers_insert_backoffice','suppliers_update_backoffice',
    'suppliers_platform_superadmin_select','suppliers_platform_superadmin_insert','suppliers_platform_superadmin_update',
    'material_suppliers_select_backoffice','material_suppliers_insert_backoffice','material_suppliers_update_backoffice',
    'material_suppliers_platform_superadmin_select','material_suppliers_platform_superadmin_insert','material_suppliers_platform_superadmin_update')) then
    raise exception '118 contract failed: unexpected supplier catalog policy exists';
  end if;

  for v_policy_exists in
    select not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name and p.policyname = t.policy_name and p.cmd = t.policy_cmd and p.roles @> array['authenticated']::name[])
    from (values
      ('suppliers','suppliers_select_backoffice','SELECT'), ('suppliers','suppliers_insert_backoffice','INSERT'), ('suppliers','suppliers_update_backoffice','UPDATE'),
      ('suppliers','suppliers_platform_superadmin_select','SELECT'), ('suppliers','suppliers_platform_superadmin_insert','INSERT'), ('suppliers','suppliers_platform_superadmin_update','UPDATE'),
      ('material_suppliers','material_suppliers_select_backoffice','SELECT'), ('material_suppliers','material_suppliers_insert_backoffice','INSERT'), ('material_suppliers','material_suppliers_update_backoffice','UPDATE'),
      ('material_suppliers','material_suppliers_platform_superadmin_select','SELECT'), ('material_suppliers','material_suppliers_platform_superadmin_insert','INSERT'), ('material_suppliers','material_suppliers_platform_superadmin_update','UPDATE')) as t(table_name, policy_name, policy_cmd)
  loop
    if v_policy_exists then raise exception '118 contract failed: required policy is missing'; end if;
  end loop;

  for v_expression in
    select lower(regexp_replace(replace(coalesce(p.qual, ''), 'public.', ''), '\s+', ' ', 'g'))
    from pg_policies p
    where p.schemaname = 'public'
      and p.policyname in ('suppliers_select_backoffice','suppliers_insert_backoffice','suppliers_update_backoffice','material_suppliers_select_backoffice','material_suppliers_insert_backoffice','material_suppliers_update_backoffice')
      and p.cmd in ('SELECT','UPDATE')
    union all
    select lower(regexp_replace(replace(coalesce(p.with_check, ''), 'public.', ''), '\s+', ' ', 'g'))
    from pg_policies p
    where p.schemaname = 'public'
      and p.policyname in ('suppliers_insert_backoffice','suppliers_update_backoffice','material_suppliers_insert_backoffice','material_suppliers_update_backoffice')
  loop
    if position('company_id' in v_expression) = 0 or position('current_company_id' in v_expression) = 0 or position('has_any_role' in v_expression) = 0 or position('superadmin' in v_expression) = 0 or position('sat' in v_expression) = 0 or position('gerencia' in v_expression) = 0 or position('oficina' in v_expression) = 0 or position(' or ' in v_expression) > 0 then
      raise exception '118 contract failed: backoffice policy scope is invalid';
    end if;
  end loop;

  for v_expression in
    select coalesce(p.qual, '') from pg_policies p where p.schemaname = 'public' and p.policyname in ('suppliers_platform_superadmin_select','material_suppliers_platform_superadmin_select')
    union all
    select coalesce(p.with_check, '') from pg_policies p where p.schemaname = 'public' and p.policyname in ('suppliers_platform_superadmin_insert','material_suppliers_platform_superadmin_insert','suppliers_platform_superadmin_update','material_suppliers_platform_superadmin_update')
    union all
    select coalesce(p.qual, '') from pg_policies p where p.schemaname = 'public' and p.policyname in ('suppliers_platform_superadmin_update','material_suppliers_platform_superadmin_update')
  loop
    if position('is_platform_superadmin' in lower(v_expression)) = 0 then
      raise exception '118 contract failed: platform superadmin policy expression is invalid';
    end if;
  end loop;
end;
$$;

select 'verify_118_harden_supplier_permissions: PASS' as result;
