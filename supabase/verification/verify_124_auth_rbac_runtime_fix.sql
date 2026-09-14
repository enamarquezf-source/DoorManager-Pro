-- Read-only verification for AUTH-RBAC-002.
do $verify$
declare
  v_proc pg_proc%rowtype;
  v_source text;
  v_oid oid;
  v_using_expr text;
  v_check_expr text;
  v_policy record;
  v_sig record;
  v_rpc record;
begin
  -- USER LIST RPC: exact signature + contract
  v_oid := to_regprocedure('public.dmp_admin_list_users()');
  if v_oid is null then
    raise exception '124 contract failed: dmp_admin_list_users() missing';
  end if;
  select * into v_proc from pg_proc where oid = v_oid;

  if not v_proc.proretset then
    raise exception '124 contract failed: dmp_admin_list_users() must be SETOF';
  end if;
  if v_proc.prorettype <> 'public.profiles'::regtype then
    raise exception '124 contract failed: dmp_admin_list_users() must return SETOF public.profiles';
  end if;
  if not v_proc.prosecdef then
    raise exception '124 contract failed: dmp_admin_list_users() must be SECURITY DEFINER';
  end if;
  if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
    raise exception '124 contract failed: dmp_admin_list_users() search_path';
  end if;

  v_source := lower(regexp_replace(v_proc.prosrc, E'\\s+', ' ', 'g'));
  if position('return query select p.* from public.profiles p' in v_source) = 0 then
    raise exception '124 contract failed: dmp_admin_list_users() must expand the profiles composite';
  end if;
  if position('public.is_platform_superadmin()' in v_source) = 0
     or position('p.company_id = public.current_company_id()' in v_source) = 0 then
    raise exception '124 contract failed: dmp_admin_list_users() tenant/platform scope';
  end if;
  if position('has_permission(''admin.users.read'')' in v_source) = 0
     or position('has_permission(''users.read'')' in v_source) > 0 then
    raise exception '124 contract failed: dmp_admin_list_users() administrative permission';
  end if;

  -- ACL
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '124 contract failed: authenticated cannot execute dmp_admin_list_users()';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '124 contract failed: anon can execute dmp_admin_list_users()';
  end if;
  if exists (
    select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception '124 contract failed: PUBLIC can execute dmp_admin_list_users()';
  end if;

  -- ROLE PERMISSIONS SEED: Oficina
  if (
    select count(distinct p.code)
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'Oficina'
      and p.code in ('purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel')
  ) <> 5 then
    raise exception '124 contract failed: Oficina purchase order permissions';
  end if;
  if (
    select count(distinct p.code)
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'Oficina'
      and p.code in ('purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel')
  ) <> 5 then
    raise exception '124 contract failed: Oficina purchase receipt permissions';
  end if;

  -- ROLE PERMISSIONS SEED: Gerencia
  if (
    select count(distinct p.code)
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'Gerencia'
      and p.code in ('purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel')
  ) <> 5 then
    raise exception '124 contract failed: Gerencia purchase order permissions';
  end if;
  if (
    select count(distinct p.code)
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'Gerencia'
      and p.code in ('purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel')
  ) <> 5 then
    raise exception '124 contract failed: Gerencia purchase receipt permissions';
  end if;

  -- ROLE PERMISSIONS SEED: tenant superadmin
  if (
    select count(distinct p.code)
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'superadmin'
      and p.code in ('purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel')
  ) <> 5 then
    raise exception '124 contract failed: tenant superadmin purchase order permissions';
  end if;
  if (
    select count(distinct p.code)
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'superadmin'
      and p.code in ('purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel')
  ) <> 5 then
    raise exception '124 contract failed: tenant superadmin purchase receipt permissions';
  end if;

  -- ROLE PERMISSIONS SEED: SAT read-only
  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'SAT' and p.code = 'purchase_orders.read'
  ) or exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'SAT' and p.code in ('purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel')
  ) then
    raise exception '124 contract failed: SAT purchase order read-only contract';
  end if;
  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'SAT' and p.code = 'purchase_receipts.read'
  ) or exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name = 'SAT' and p.code in ('purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel')
  ) then
    raise exception '124 contract failed: SAT purchase receipt read-only contract';
  end if;

  -- ROLE PERMISSIONS SEED: Tecnico/Comercial none
  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name in ('Tecnico','Comercial') and p.code like 'purchase_orders.%'
  ) then
    raise exception '124 contract failed: Tecnico/Comercial has purchase order role defaults';
  end if;
  if exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.name in ('Tecnico','Comercial') and p.code like 'purchase_receipts.%'
  ) then
    raise exception '124 contract failed: Tecnico/Comercial has purchase receipt role defaults';
  end if;

  -- MODULE CODES
  if not exists (select 1 from public.app_modules where code = 'purchase_orders' and active)
     or not exists (select 1 from public.app_modules where code = 'purchase_receipts' and active) then
    raise exception '124 contract failed: canonical purchase modules';
  end if;

  -- EFFECTIVE PERMISSIONS FOR ACTIVE PROFILES (canonical via profile_roles)
  if exists (
    select 1
    from public.profiles profile
    join public.profile_roles pr on pr.profile_id = profile.id
    join public.roles r on r.id = pr.role_id and r.name in ('Oficina','Gerencia','superadmin')
    cross join unnest(array[
      'purchase_orders.read','purchase_orders.create','purchase_orders.update','purchase_orders.submit','purchase_orders.cancel',
      'purchase_receipts.read','purchase_receipts.create','purchase_receipts.update','purchase_receipts.confirm','purchase_receipts.cancel'
    ]) permission_code
    where profile.active and profile.deleted_at is null
      and not public.dmp_profile_has_permission(profile.id, permission_code)
  ) then
    raise exception '124 contract failed: effective purchase permissions for write roles';
  end if;

  -- SUPERADMIN MODULE DEFAULT VISIBILITY (default, not override)
  if exists (
    select 1
    from public.profiles profile
    join public.profile_roles pr on pr.profile_id = profile.id
    join public.roles r on r.id = pr.role_id and r.name = 'superadmin'
    where profile.active and profile.deleted_at is null
      and not public.dmp_module_default_visible(profile.id, 'purchase_orders')
  ) then
    raise exception '124 contract failed: superadmin purchase module default visibility';
  end if;

  -- RLS POLICIES: purchase_orders
  for v_policy in
    select * from (values
      ('purchase_orders','purchase_orders_select_backoffice','SELECT','purchase_orders.read'),
      ('purchase_orders','purchase_orders_insert_backoffice','INSERT','purchase_orders.create'),
      ('purchase_orders','purchase_orders_update_backoffice','UPDATE','purchase_orders.update'),
      ('purchase_order_lines','purchase_order_lines_select_backoffice','SELECT','purchase_orders.read'),
      ('purchase_order_lines','purchase_order_lines_insert_backoffice','INSERT','purchase_orders.update'),
      ('purchase_order_lines','purchase_order_lines_update_backoffice','UPDATE','purchase_orders.update')
    ) expected(table_name, policy_name, command_name, permission_code)
  loop
    select translate(coalesce(p.qual, ''), E' \n\r\t', ''), translate(coalesce(p.with_check, ''), E' \n\r\t', '')
    into v_using_expr, v_check_expr
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = v_policy.table_name and p.policyname = v_policy.policy_name and p.cmd = v_policy.command_name;
    if not found then
      raise exception '124 contract failed: RLS policy %', v_policy.policy_name;
    end if;
    if v_policy.command_name in ('SELECT','UPDATE')
       and (position('is_platform_superadmin()' in v_using_expr) = 0
         or position('current_company_id()' in v_using_expr) = 0
         or position('has_permission(' in v_using_expr) = 0
         or position(quote_literal(v_policy.permission_code) in v_using_expr) = 0) then
      raise exception '124 contract failed: RLS USING %', v_policy.policy_name;
    end if;
    if v_policy.command_name in ('INSERT','UPDATE')
       and (position('is_platform_superadmin()' in v_check_expr) = 0
         or position('current_company_id()' in v_check_expr) = 0
         or position('has_permission(' in v_check_expr) = 0
         or position(quote_literal(v_policy.permission_code) in v_check_expr) = 0) then
      raise exception '124 contract failed: RLS WITH CHECK %', v_policy.policy_name;
    end if;
  end loop;

  -- RLS POLICIES: purchase_receipts (read only; insert/update on lines via purchase_orders.update)
  for v_policy in
    select * from (values
      ('purchase_receipts','purchase_receipts_select_backoffice','SELECT','purchase_receipts.read'),
      ('purchase_receipt_lines','purchase_receipt_lines_select_backoffice','SELECT','purchase_receipts.read')
    ) expected(table_name, policy_name, command_name, permission_code)
  loop
    select translate(coalesce(p.qual, ''), E' \n\r\t', ''), translate(coalesce(p.with_check, ''), E' \n\r\t', '')
    into v_using_expr, v_check_expr
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = v_policy.table_name and p.policyname = v_policy.policy_name and p.cmd = v_policy.command_name;
    if not found then
      raise exception '124 contract failed: RLS policy %', v_policy.policy_name;
    end if;
    if v_policy.command_name = 'SELECT'
       and (position('is_platform_superadmin()' in v_using_expr) = 0
         or position('current_company_id()' in v_using_expr) = 0
         or position('has_permission(' in v_using_expr) = 0
         or position(quote_literal(v_policy.permission_code) in v_using_expr) = 0) then
      raise exception '124 contract failed: RLS USING %', v_policy.policy_name;
    end if;
  end loop;

  -- USER ACCESS RPCS: exact signatures, shape, security, ACL
  for v_sig in
    select * from (values
      ('public.dmp_admin_get_user_access(uuid)'::text),
      ('public.dmp_admin_update_user_access(uuid,text[],jsonb,jsonb)'::text),
      ('public.dmp_get_current_access()'::text)
    ) s(signature)
  loop
    v_oid := to_regprocedure(v_sig.signature);
    if v_oid is null then
      raise exception '124 contract failed: RPC % missing', v_sig.signature;
    end if;
    select * into v_proc from pg_proc where oid = v_oid;

    if v_proc.prorettype <> 'jsonb'::regtype then
      raise exception '124 contract failed: % must return jsonb', v_sig.signature;
    end if;
    if v_proc.proretset then
      raise exception '124 contract failed: % must not be SETOF', v_sig.signature;
    end if;
    if not v_proc.prosecdef then
      raise exception '124 contract failed: % must be SECURITY DEFINER', v_sig.signature;
    end if;
    if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
      raise exception '124 contract failed: % search_path', v_sig.signature;
    end if;

    -- ACL
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '124 contract failed: authenticated cannot execute %', v_sig.signature;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '124 contract failed: anon can execute %', v_sig.signature;
    end if;
    if exists (
      select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception '124 contract failed: PUBLIC can execute %', v_sig.signature;
    end if;
  end loop;

  -- dmp_admin_update_user_access: update boundaries
  v_oid := to_regprocedure('public.dmp_admin_update_user_access(uuid,text[],jsonb,jsonb)');
  select lower(regexp_replace(p.prosrc, E'\\s+', ' ', 'g')) into v_source
  from pg_proc p where p.oid = v_oid;
  if position('not public.is_platform_superadmin() and v_target.company_id <> v_actor.company_id' in v_source) = 0
     or position('dmp_can_manage_tenant_superadmin_target(v_target.id)' in v_source) = 0
     or position('cardinality(p_role_names) = 0' in v_source) = 0
     or position('delete from public.profile_permission_grants' in v_source) = 0
     or position('insert into public.audit_log' in v_source) = 0 then
    raise exception '124 contract failed: update access boundaries';
  end if;

  -- PURCHASE RPCS: exact signatures, has_permission granular, no has_any_role
  for v_rpc in
    select * from (values
      ('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text)', 'purchase_orders.create'),
      ('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text)', 'purchase_orders.update'),
      ('public.dmp_add_purchase_order_line(uuid,uuid,uuid,numeric,numeric)', 'purchase_orders.update'),
      ('public.dmp_update_purchase_order_line(uuid,uuid,uuid,numeric,numeric)', 'purchase_orders.update'),
      ('public.dmp_remove_purchase_order_line(uuid)', 'purchase_orders.update'),
      ('public.dmp_order_purchase_order(uuid)', 'purchase_orders.submit'),
      ('public.dmp_cancel_purchase_order(uuid)', 'purchase_orders.cancel')
    ) expected(signature, permission_code)
  loop
    v_oid := to_regprocedure(v_rpc.signature);
    if v_oid is null then
      raise exception '124 contract failed: RPC % missing', v_rpc.signature;
    end if;
    select lower(regexp_replace(p.prosrc, E'\\s+', ' ', 'g')) into v_source
    from pg_proc p where p.oid = v_oid;

    if position('has_permission(''' || v_rpc.permission_code || ''')' in v_source) = 0 then
      raise exception '124 contract failed: % uses has_permission %', v_rpc.signature, v_rpc.permission_code;
    end if;
    if position('has_any_role' in v_source) > 0 then
      raise exception '124 contract failed: % still uses has_any_role', v_rpc.signature;
    end if;

    -- SECURITY DEFINER + search_path
    select * into v_proc from pg_proc where oid = v_oid;
    if not v_proc.prosecdef then
      raise exception '124 contract failed: % must be SECURITY DEFINER', v_rpc.signature;
    end if;
    if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
      raise exception '124 contract failed: % search_path', v_rpc.signature;
    end if;

    -- ACL
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '124 contract failed: authenticated cannot execute %', v_rpc.signature;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '124 contract failed: anon can execute %', v_rpc.signature;
    end if;
    if exists (
      select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception '124 contract failed: PUBLIC can execute %', v_rpc.signature;
    end if;

  end loop;

  -- RECEIPT RPCS: exact signatures, has_permission granular, no has_any_role
  for v_rpc in
    select * from (values
      ('public.dmp_create_purchase_receipt(uuid,date,uuid,text,text)', 'purchase_receipts.create'),
      ('public.dmp_update_purchase_receipt(uuid,date,uuid,text,text)', 'purchase_receipts.update'),
      ('public.dmp_add_purchase_receipt_line(uuid,uuid,numeric,numeric)', 'purchase_receipts.update'),
      ('public.dmp_update_purchase_receipt_line(uuid,numeric,numeric)', 'purchase_receipts.update'),
      ('public.dmp_remove_purchase_receipt_line(uuid)', 'purchase_receipts.update'),
      ('public.dmp_confirm_purchase_receipt(uuid)', 'purchase_receipts.confirm'),
      ('public.dmp_cancel_draft_purchase_receipt(uuid)', 'purchase_receipts.cancel')
    ) expected(signature, permission_code)
  loop
    v_oid := to_regprocedure(v_rpc.signature);
    if v_oid is null then
      raise exception '124 contract failed: RPC % missing', v_rpc.signature;
    end if;
    select lower(regexp_replace(p.prosrc, E'\\s+', ' ', 'g')) into v_source
    from pg_proc p where p.oid = v_oid;

    if position('has_permission(''' || v_rpc.permission_code || ''')' in v_source) = 0 then
      raise exception '124 contract failed: % uses has_permission %', v_rpc.signature, v_rpc.permission_code;
    end if;
    if position('has_any_role' in v_source) > 0 then
      raise exception '124 contract failed: % still uses has_any_role', v_rpc.signature;
    end if;

    -- SECURITY DEFINER + search_path
    select * into v_proc from pg_proc where oid = v_oid;
    if not v_proc.prosecdef then
      raise exception '124 contract failed: % must be SECURITY DEFINER', v_rpc.signature;
    end if;
    if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
      raise exception '124 contract failed: % search_path', v_rpc.signature;
    end if;

    -- ACL
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception '124 contract failed: authenticated cannot execute %', v_rpc.signature;
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      raise exception '124 contract failed: anon can execute %', v_rpc.signature;
    end if;
    if exists (
      select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception '124 contract failed: PUBLIC can execute %', v_rpc.signature;
    end if;

    if v_rpc.signature in (
      'public.dmp_add_purchase_receipt_line(uuid,uuid,numeric,numeric)',
      'public.dmp_update_purchase_receipt_line(uuid,numeric,numeric)'
    ) and position('status <> ''draft''' in v_source) = 0 then
      raise exception '124 contract failed: % must require draft receipt', v_rpc.signature;
    end if;
    if v_rpc.signature = 'public.dmp_remove_purchase_receipt_line(uuid)' and position('pr.status=''draft''' in v_source) = 0 then
      raise exception '124 contract failed: remove receipt line must require draft receipt';
    end if;

    if v_rpc.signature = 'public.dmp_update_purchase_receipt_line(uuid,numeric,numeric)' and (
      position('v_line public.purchase_receipt_lines' in v_source) = 0
      or position('v_receipt public.purchase_receipts' in v_source) = 0
      or position('from public.purchase_receipts where id=v_line.purchase_receipt_id for update' in v_source) = 0
      or position('v_receipt.company_id <> v_line.company_id' in v_source) = 0
      or position('p_received_quantity is null or p_received_quantity <= 0' in v_source) = 0
      or position('p_actual_unit_cost is not null and p_actual_unit_cost < 0' in v_source) = 0
    ) then
      raise exception '124 contract failed: update receipt line immutability';
    end if;
  end loop;

  -- VISIBILITY: migration 124 contains no data repair for explicit overrides.
  -- Runtime admin access updates are intentionally allowed to manage visibility.

end
$verify$;

select 'verify_124_auth_rbac_runtime_fix: PASS' as result;
