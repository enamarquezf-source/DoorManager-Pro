-- Structural postflight for migration 128. Do not execute from the application.
do $$
declare
  v_table text;
  v_policy text;
  v_command text;
  v_permission text;
  v_expression text;
begin
  foreach v_table in array array['suppliers', 'material_suppliers'] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind = 'r'
        and c.relrowsecurity
    ) then
      raise exception '128 contract failed: RLS is not enabled on public.%', v_table;
    end if;
  end loop;

  -- Check each table/policy/command/role tuple together so a policy with the
  -- right name on another table cannot produce a false PASS.
  for v_policy, v_table, v_command, v_permission in
    select * from (values
      ('suppliers_select_permissions','suppliers','SELECT','suppliers.read'),
      ('suppliers_insert_permissions','suppliers','INSERT','suppliers.create'),
      ('suppliers_update_permissions','suppliers','UPDATE','suppliers.update'),
      ('material_suppliers_select_permissions','material_suppliers','SELECT','suppliers.read'),
      ('material_suppliers_insert_permissions','material_suppliers','INSERT','suppliers.update'),
      ('material_suppliers_update_permissions','material_suppliers','UPDATE','suppliers.update')
    ) as expected(policy_name, table_name, command_name, permission_code)
  loop
    if not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname = v_policy
        and p.cmd = v_command
        and p.roles = array['authenticated']::name[]
    ) then
      raise exception '128 contract failed: invalid table/policy/command/role tuple for %', v_policy;
    end if;

    if v_command in ('SELECT', 'UPDATE') then
      select lower(regexp_replace(
        replace(replace(coalesce(p.qual, ''), 'public.', ''), '::text', ''),
        '\s+', ' ', 'g'))
      into v_expression
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname = v_policy
        and p.cmd = v_command;

      if v_expression is null
         or position('current_company_id' in v_expression) = 0
         or position('has_permission(' || quote_literal(v_permission) || ')' in v_expression) = 0
         or position('is_platform_superadmin' in v_expression) = 0
         or v_expression ~ 'and\s*\(\s*has_permission\([^)]*\)\s*or\s*is_platform_superadmin' then
        raise exception '128 contract failed: invalid USING scope for %', v_policy;
      end if;
    end if;

    if v_command in ('INSERT', 'UPDATE') then
      select lower(regexp_replace(
        replace(replace(coalesce(p.with_check, ''), 'public.', ''), '::text', ''),
        '\s+', ' ', 'g'))
      into v_expression
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_table
        and p.policyname = v_policy
        and p.cmd = v_command;

      if v_expression is null
         or position('current_company_id' in v_expression) = 0
         or position('has_permission(' || quote_literal(v_permission) || ')' in v_expression) = 0
         or position('is_platform_superadmin' in v_expression) = 0
         or v_expression ~ 'and\s*\(\s*has_permission\([^)]*\)\s*or\s*is_platform_superadmin' then
        raise exception '128 contract failed: invalid WITH CHECK scope for %', v_policy;
      end if;
    end if;
  end loop;

  select lower(regexp_replace(
    replace(replace(coalesce(p.qual, ''), 'public.', ''), '::text', ''),
    '\s+', ' ', 'g'))
  into v_expression
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'suppliers'
    and p.policyname = 'suppliers_select_permissions'
    and p.cmd = 'SELECT';
  if position('deleted_at is null' in v_expression) = 0 then
    raise exception '128 contract failed: suppliers SELECT lost deleted_at filtering';
  end if;
end;
$$;

select 'verify_128_supplier_permissions_rls: PASS' as result;
