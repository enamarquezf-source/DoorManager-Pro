-- Read-only structural verification for migration 138.
do $verify$
declare
  v_table oid := to_regclass('public.platform_superadmins');
  v_function oid := to_regprocedure('public.is_platform_superadmin()');
  v_proc pg_proc%rowtype;
  v_acl record;
  v_source text;
  v_profile_attnum smallint;
  v_created_at_attnum smallint;
  v_created_by_attnum smallint;
  v_fk record;
begin
  if v_table is null then
    raise exception '138 contract failed: platform_superadmins missing';
  end if;
  if exists (
    select 1
    from pg_attribute
    where attrelid = v_table and attname = 'company_id' and not attisdropped
  ) then
    raise exception '138 contract failed: platform membership must not be tenant-scoped';
  end if;

  select attnum into v_profile_attnum
  from pg_attribute
  where attrelid = v_table and attname = 'profile_id' and not attisdropped;
  if v_profile_attnum is null then
    raise exception '138 contract failed: profile_id missing';
  end if;
  if not exists (
    select 1
    from pg_attribute
    where attrelid = v_table and attnum = v_profile_attnum and atttypid = 'uuid'::regtype
  ) then
    raise exception '138 contract failed: profile_id must be uuid';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = v_table and contype = 'p' and conkey = array[v_profile_attnum]::smallint[]
  ) then
    raise exception '138 contract failed: profile_id primary key missing';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = v_table
      and c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.conkey = array[v_profile_attnum]::smallint[]
  ) then
    raise exception '138 contract failed: profile_id profiles FK missing';
  end if;
  select attnum into v_created_at_attnum
  from pg_attribute
  where attrelid = v_table and attname = 'created_at' and not attisdropped;
  if v_created_at_attnum is null
     or not exists (select 1 from pg_attribute where attrelid = v_table and attnum = v_created_at_attnum and atttypid = 'timestamptz'::regtype and attnotnull)
     or not exists (select 1 from pg_attrdef where adrelid = v_table and adnum = v_created_at_attnum and pg_get_expr(adbin, adrelid) = 'now()') then
    raise exception '138 contract failed: created_at definition';
  end if;
  select attnum into v_created_by_attnum
  from pg_attribute
  where attrelid = v_table and attname = 'created_by' and not attisdropped;
  if v_created_by_attnum is null
     or exists (select 1 from pg_attribute where attrelid = v_table and attnum = v_created_by_attnum and attnotnull)
     or not exists (
       select 1 from pg_attribute where attrelid = v_table and attnum = v_created_by_attnum and atttypid = 'uuid'::regtype
     ) then
    raise exception '138 contract failed: created_by definition';
  end if;
  select c.confdeltype into v_fk
  from pg_constraint c
  where c.conrelid = v_table and c.contype = 'f' and c.conkey = array[v_profile_attnum]::smallint[];
  if v_fk.confdeltype <> 'c' then
    raise exception '138 contract failed: profile_id must cascade on delete';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = v_table and c.contype = 'f' and c.conkey = array[v_created_by_attnum]::smallint[]
      and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'n'
  ) then
    raise exception '138 contract failed: created_by SET NULL FK missing';
  end if;
  if exists (
    select 1 from pg_attribute
    where attrelid = v_table and not attisdropped and attname in ('active', 'revoked_at', 'company_id')
  ) then
    raise exception '138 contract failed: tenant lifecycle columns leaked into platform membership';
  end if;
  if has_table_privilege('authenticated', v_table, 'SELECT')
     or has_table_privilege('authenticated', v_table, 'INSERT')
     or has_table_privilege('authenticated', v_table, 'UPDATE')
     or has_table_privilege('authenticated', v_table, 'DELETE') then
    raise exception '138 contract failed: authenticated table access';
  end if;
  if has_table_privilege('anon', v_table, 'SELECT')
     or has_table_privilege('anon', v_table, 'INSERT')
     or has_table_privilege('anon', v_table, 'UPDATE')
     or has_table_privilege('anon', v_table, 'DELETE') then
    raise exception '138 contract failed: anon table access';
  end if;
  for v_acl in select * from aclexplode(coalesce((select relacl from pg_class where oid = v_table), acldefault('r', (select relowner from pg_class where oid = v_table)))) loop
    if v_acl.grantee = 0 then
      raise exception '138 contract failed: PUBLIC table privilege';
    end if;
  end loop;
  if not exists (select 1 from pg_class where oid = v_table and relrowsecurity) then
    raise exception '138 contract failed: RLS disabled';
  end if;
  if exists (select 1 from pg_policy where polrelid = v_table) then
    raise exception '138 contract failed: client policies must not exist';
  end if;

  if v_function is null then
    raise exception '138 contract failed: platform helper missing';
  end if;
  select * into v_proc from pg_proc where oid = v_function;
  if not v_proc.prosecdef then
    raise exception '138 contract failed: platform helper SECURITY DEFINER';
  end if;
  if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
    raise exception '138 contract failed: platform helper search_path';
  end if;
  v_source := lower(pg_get_functiondef(v_function));
  if position('platform_superadmins' in v_source) = 0
     or position('auth.uid()' in v_source) = 0
     or position('p.active = true' in v_source) = 0
     or position('p.deleted_at is null' in v_source) = 0 then
    raise exception '138 contract failed: platform authority source';
  end if;
  if position('primary_area' in v_source) > 0 or position('profile_roles' in v_source) > 0 then
    raise exception '138 contract failed: tenant authority leaked into platform helper';
  end if;
  if not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception '138 contract failed: authenticated helper execute';
  end if;
  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception '138 contract failed: anon helper execute';
  end if;
  for v_acl in select * from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) loop
    if v_acl.grantee = 0 and v_acl.privilege_type = 'EXECUTE' then
      raise exception '138 contract failed: PUBLIC helper execute';
    end if;
  end loop;
end $verify$;
