-- Read-only structural verification for migration 139.
do $verify$
declare
  v_oid oid;
  v_profile_roles_table oid := to_regclass('public.profile_roles');
  v_module_table oid := to_regclass('public.profile_module_visibility');
  v_proc pg_proc%rowtype;
  v_acl record;
  v_source text;
  v_expected record;
begin
  for v_expected in
    select * from (values
      ('public.dmp_can_manage_tenant_superadmin_target(uuid)', false),
      ('public.dmp_can_grant_tenant_superadmin(uuid)', false),
      ('public.dmp_assert_user_management_transition(uuid,boolean,text[])', false),
      ('public.dmp_admin_update_user(uuid,jsonb)', true),
      ('public.superadmin_save_profile_with_roles(uuid,jsonb,text[])', true),
      ('public.dmp_admin_update_user_access(uuid,text[],jsonb,jsonb)', true),
      ('public.superadmin_create_profile(jsonb)', false),
      ('public.superadmin_update_profile(uuid,jsonb)', false),
      ('public.superadmin_set_profile_roles(uuid,text[])', false)
    ) as expected(function_signature, authenticated_execute)
  loop
    v_oid := to_regprocedure(v_expected.function_signature);
    if v_oid is null then
      raise exception '139 contract failed: function missing %', v_expected.function_signature;
    end if;

    select * into v_proc from pg_proc where oid = v_oid;
    if not v_proc.prosecdef then
      raise exception '139 contract failed: SECURITY DEFINER missing %', v_expected.function_signature;
    end if;
    if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
      raise exception '139 contract failed: fixed search_path missing %', v_expected.function_signature;
    end if;
    if v_expected.authenticated_execute and not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '139 contract failed: authenticated execute missing %', v_expected.function_signature;
    end if;
    if not v_expected.authenticated_execute and has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '139 contract failed: internal helper is client-callable %', v_expected.function_signature;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '139 contract failed: anon execute %', v_expected.function_signature;
    end if;
    for v_acl in select * from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) loop
      if v_acl.grantee = 0 and v_acl.privilege_type = 'EXECUTE' then
        raise exception '139 contract failed: PUBLIC execute %', v_expected.function_signature;
      end if;
    end loop;
  end loop;

  v_oid := to_regprocedure('public.dmp_can_manage_tenant_superadmin_target(uuid)');
  v_source := lower(regexp_replace(pg_get_functiondef(v_oid), '\s+', ' ', 'g'));
  if position('target_role.name = ''superadmin''' in v_source) = 0
     or position('actor_role.name = ''superadmin''' in v_source) = 0
     or position('public.is_platform_superadmin()' in v_source) = 0
     or position('v_actor.company_id <> v_target.company_id' in v_source) = 0 then
    raise exception '139 contract failed: protected target guard';
  end if;

  v_oid := to_regprocedure('public.dmp_can_grant_tenant_superadmin(uuid)');
  v_source := lower(regexp_replace(pg_get_functiondef(v_oid), '\s+', ' ', 'g'));
  if position('active' in v_source) = 0
     or position('deleted_at is null' in v_source) = 0
     or position('r.name = ''superadmin''' in v_source) = 0
     or position('public.is_platform_superadmin()' in v_source) = 0
     or position('v_actor.company_id is distinct from p_company_id' in v_source) = 0 then
    raise exception '139 contract failed: Superadmin grant authority helper';
  end if;

  v_oid := to_regprocedure('public.dmp_assert_user_management_transition(uuid,boolean,text[])');
  v_source := lower(regexp_replace(pg_get_functiondef(v_oid), '\s+', ' ', 'g'));
  if position('pg_advisory_xact_lock(hashtextextended(''dmp:tenant-user-management:'' || v_company_id::text, 0))' in v_source) = 0 then
    raise exception '139 contract failed: company advisory lock missing';
  end if;
  if position('pg_advisory_xact_lock' in v_source) > position('select count(*) into v_remaining' in v_source) then
    raise exception '139 contract failed: lock must precede last-superadmin count';
  end if;
  if position('pg_advisory_xact_lock' in v_source) > position('for update' in v_source) then
    raise exception '139 contract failed: target refresh must follow company lock';
  end if;
  if position('p_profile_id = v_actor_id' in v_source) = 0
     or position('no puedes dejar la empresa sin superadmin activo' in v_source) = 0 then
    raise exception '139 contract failed: transition invariants';
  end if;

  v_oid := to_regprocedure('public.superadmin_save_profile_with_roles(uuid,jsonb,text[])');
  v_source := lower(regexp_replace(pg_get_functiondef(v_oid), '\s+', ' ', 'g'));
  if position('p_profile ? ''auth_user_id''' in v_source) = 0
     or position('p_profile ? ''company_id''' in v_source) = 0
     or position('public.current_company_id()' in v_source) = 0
     or position('insert into public.profile_roles' in v_source) = 0
     or position('insert into public.audit_log' in v_source) = 0
     or position('dmp_can_manage_tenant_superadmin_target' in v_source) = 0
     or position('dmp_can_grant_tenant_superadmin' in v_source) = 0
     or position('admin.roles.manage' in v_source) = 0
     or position('superadmin' in v_source) = 0
     or position('dmp_assert_user_management_transition' in v_source) = 0
     or position('p_profile->>''primary_area''' in v_source) > 0 then
    raise exception '139 contract failed: profile RPC contracts';
  end if;
  if position('p_profile_id is null and (p_role_names is null or cardinality(p_role_names) = 0)' in v_source) = 0
     or position('la creación requiere roles explícitos' in v_source) = 0
     or position('p_role_names is null or cardinality(p_role_names) = 0' in v_source) = 0 then
    raise exception '139 contract failed: role input semantics';
  end if;
  if position('v_active := case when p_profile ? ''active''' in v_source) = 0
     or position('v_active := case when p_profile ? ''active''' in v_source) > position('if v_profile.id = v_actor.id' in v_source)
     or position('v_active := case when p_profile ? ''active''' in v_source) > position('perform public.dmp_assert_user_management_transition' in v_source) then
    raise exception '139 contract failed: v_active must precede security guards';
  end if;

  v_oid := to_regprocedure('public.dmp_admin_update_user(uuid,jsonb)');
  v_source := lower(regexp_replace(pg_get_functiondef(v_oid), '\s+', ' ', 'g'));
  if position('p_payload ? ''auth_user_id''' in v_source) = 0
     or position('p_payload ? ''company_id''' in v_source) = 0
     or position('p_payload ? ''primary_area''' in v_source) = 0
     or position('dmp_assert_user_management_transition' in v_source) = 0
     or position('not public.is_platform_superadmin() and v_old.company_id <> v_actor.company_id' in v_source) = 0
     or position('insert into public.audit_log' in v_source) = 0 then
    raise exception '139 contract failed: legacy profile RPC contracts';
  end if;

  v_oid := to_regprocedure('public.dmp_admin_update_user_access(uuid,text[],jsonb,jsonb)');
  v_source := lower(pg_get_functiondef(v_oid));
  if v_module_table is null then
    raise exception '139 contract failed: profile_module_visibility missing';
  end if;
  if not exists (
    select 1
    from pg_attribute
    where attrelid = v_module_table
      and attname = 'updated_at'
      and not attisdropped
      and atttypid = 'timestamptz'::regtype
      and attnotnull
  ) then
    raise exception '139 contract failed: profile_module_visibility.updated_at definition';
  end if;
  if position('dmp_can_manage_tenant_superadmin_target' in v_source) = 0
     or position('v_target.company_id <> v_actor.company_id' in v_source) = 0
     or position('dmp_can_grant_tenant_superadmin' in v_source) = 0
     or position('public.profile_roles' in v_source) = 0
     or position('public.profile_permission_grants' in v_source) = 0
     or position('public.profile_module_visibility' in v_source) = 0
     or position('insert into public.audit_log' in v_source) = 0
     or position('insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, ''profile_roles''' in v_source) = 0
     or position('insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, ''profile_permission_grants''' in v_source) = 0
     or position('insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, ''profile_module_visibility''' in v_source) = 0
     or position('old_data' in v_source) = 0
     or position('new_data' in v_source) = 0
     or position('insert into public.profile_module_visibility(profile_id, module_id, visible, updated_at)' in v_source) = 0
     or position('values (v_target.id, v_module_id, (v_item->>''visible'')::boolean, now())' in v_source) = 0
     or position('on conflict (profile_id, module_id)' in v_source) = 0
     or position('visible = excluded.visible' in v_source) = 0
     or position('updated_at = now()' in v_source) = 0 then
    raise exception '139 contract failed: access RPC contracts';
  end if;
  if v_profile_roles_table is null
     or has_table_privilege('anon', v_profile_roles_table, 'INSERT')
     or has_table_privilege('anon', v_profile_roles_table, 'UPDATE')
     or has_table_privilege('anon', v_profile_roles_table, 'DELETE')
     or has_table_privilege('authenticated', v_profile_roles_table, 'INSERT')
     or has_table_privilege('authenticated', v_profile_roles_table, 'UPDATE')
     or has_table_privilege('authenticated', v_profile_roles_table, 'DELETE') then
    raise exception '139 contract failed: direct profile_roles writes remain client-callable';
  end if;
  for v_acl in select * from aclexplode(coalesce((select relacl from pg_class where oid = v_profile_roles_table), acldefault('r', (select relowner from pg_class where oid = v_profile_roles_table)))) loop
    if v_acl.grantee = 0 and v_acl.privilege_type in ('INSERT', 'UPDATE', 'DELETE') then
      raise exception '139 contract failed: PUBLIC profile_roles DML privilege';
    end if;
  end loop;
end $verify$;
