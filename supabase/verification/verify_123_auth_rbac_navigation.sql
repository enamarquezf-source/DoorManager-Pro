-- Strict, read-only structural verification for migration 123.
do $$
declare
  v_name text;
  v_code text;
  v_proc record;
  v_expected record;
  v_arg text;
  v_expected_return_oid oid;
  v_expected_arg_oid oid;
  v_role_constraint text;
  v_using_expr text;
  v_check_expr text;
  v_i integer;
  v_tables text[] := array['permissions','role_permissions','profile_permission_grants','app_modules','profile_module_visibility'];
begin
  select pg_get_constraintdef(c.oid) into v_role_constraint
  from pg_constraint c
  where c.conrelid='public.roles'::regclass and c.conname='roles_name_check' and c.contype='c' and c.convalidated;
  if v_role_constraint is null then raise exception '123 contract failed: roles_name_check missing or invalid'; end if;
  foreach v_name in array array['superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico'] loop
    if position(quote_literal(v_name) in v_role_constraint)=0 then raise exception '123 contract failed: roles_name_check excludes %',v_name; end if;
    if not exists(select 1 from public.roles r where r.name=v_name) then raise exception '123 contract failed: role row % missing',v_name; end if;
  end loop;
  if exists(select 1 from public.roles where name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then raise exception '123 contract failed: unexpected role row'; end if;
  if to_regprocedure('public.is_platform_superadmin()') is null then raise exception '123 contract failed: platform superadmin helper missing'; end if;
  foreach v_name in array v_tables loop
    if to_regclass('public.' || v_name) is null then raise exception '123 contract failed: table % missing', v_name; end if;
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v_name and c.relrowsecurity) then raise exception '123 contract failed: RLS missing on %', v_name; end if;
  end loop;
  foreach v_code in array array['users.read','users.create','users.update','users.deactivate','suppliers.read','purchase_orders.read','purchase_receipts.read','materials.read','stock.read','stock.adjust','sat.read','commercial.read','documents.read','billing.read','admin.users.read','admin.users.update','admin.roles.manage','admin.modules.manage','admin.audit.read'] loop
    if not exists(select 1 from public.permissions where code=v_code) then raise exception '123 contract failed: permission % missing',v_code; end if;
  end loop;
  if position('p.primary_area' in (select string_agg(p.prosrc, E'\n') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('has_permission','has_any_role'))) > 0 then raise exception '123 contract failed: primary_area used for authorization'; end if;
  if exists (select 1 from public.profiles p where p.active and p.deleted_at is null and p.primary_area in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico') and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id)) then raise exception '123 contract failed: legacy role backfill incomplete'; end if;
  foreach v_code in array array['users','suppliers','purchase_orders','purchase_receipts','materials','stock','sat','commercial','documents','billing','admin'] loop
    if not exists(select 1 from public.app_modules where code=v_code and active) then raise exception '123 contract failed: module % missing',v_code; end if;
  end loop;
  if exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.name='Gerencia' and p.code in ('admin.users.read','admin.users.update','admin.roles.manage','admin.modules.manage')) then raise exception '123 contract failed: Gerencia access-management default'; end if;
  if not exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.name='superadmin' and p.code in ('admin.roles.manage','admin.modules.manage')) then raise exception '123 contract failed: superadmin access-management defaults'; end if;
  if (select count(*) from public.permissions) <> (select count(*) from public.role_permissions rp join public.roles r on r.id=rp.role_id where r.name='superadmin') then raise exception '123 contract failed: tenant superadmin does not inherit all permissions'; end if;

  for v_expected in select * from (values
     ('dmp_profile_has_permission',2,'uuid,text','boolean',''),
     ('dmp_module_default_visible',2,'uuid,text','boolean',''),
     ('dmp_can_manage_tenant_superadmin_target',1,'uuid','boolean',''),
     ('has_permission',1,'text','boolean',''),
    ('dmp_admin_list_users',0,'','SETOF public.profiles',''),
    ('dmp_admin_update_user',2,'uuid,jsonb','public.profiles',''),
    ('dmp_admin_get_user_access',1,'uuid','jsonb',''),
    ('dmp_admin_update_user_access',4,'uuid,text[],jsonb,jsonb','jsonb',''),
    ('dmp_get_current_access',0,'','jsonb',''),
    ('dmp_adjust_warehouse_stock',6,'uuid,uuid,text,numeric,text,text','numeric',''),
    ('dmp_create_material_with_stock',1,'jsonb','public.materials','materials.create'),
    ('dmp_create_purchase_order',6,'uuid,uuid,date,uuid,text,text','uuid','purchase_orders.create'),
    ('dmp_update_purchase_order',6,'uuid,uuid,date,uuid,text,text','uuid','purchase_orders.update'),
    ('dmp_add_purchase_order_line',5,'uuid,uuid,uuid,numeric,numeric','uuid','purchase_orders.update'),
    ('dmp_update_purchase_order_line',5,'uuid,uuid,uuid,numeric,numeric','uuid','purchase_orders.update'),
    ('dmp_remove_purchase_order_line',1,'uuid','void','purchase_orders.update'),
    ('dmp_order_purchase_order',1,'uuid','uuid','purchase_orders.submit'),
    ('dmp_cancel_purchase_order',1,'uuid','uuid','purchase_orders.cancel'),
    ('dmp_create_purchase_receipt',5,'uuid,date,uuid,text,text','uuid','purchase_receipts.create'),
    ('dmp_update_purchase_receipt',5,'uuid,date,uuid,text,text','uuid','purchase_receipts.update'),
    ('dmp_add_purchase_receipt_line',4,'uuid,uuid,numeric,numeric','uuid','purchase_receipts.update'),
    ('dmp_update_purchase_receipt_line',3,'uuid,numeric,numeric','uuid','purchase_receipts.update'),
    ('dmp_remove_purchase_receipt_line',1,'uuid','void','purchase_receipts.update'),
    ('dmp_confirm_purchase_receipt',1,'uuid','uuid','purchase_receipts.confirm'),
    ('dmp_cancel_draft_purchase_receipt',1,'uuid','uuid','purchase_receipts.cancel')) rpc(name,arg_count,arg_types,return_type,permission)
  loop
    select p.* into v_proc
      from pg_proc p
     where p.oid = to_regprocedure(
       'public.' || v_expected.name || '(' || v_expected.arg_types || ')'
     );
    if v_proc.oid is null then raise exception '123 contract failed: RPC % signature missing',v_expected.name; end if;
    if v_expected.return_type like 'SETOF %' then
      v_expected_return_oid := to_regtype(substring(v_expected.return_type from 7));
      if not v_proc.proretset or v_proc.prorettype <> v_expected_return_oid then raise exception '123 contract failed: return type %',v_expected.name; end if;
    else
      v_expected_return_oid := to_regtype(v_expected.return_type);
      if v_proc.proretset or v_proc.prorettype <> v_expected_return_oid then raise exception '123 contract failed: return type %',v_expected.name; end if;
    end if;
    if v_expected.arg_types <> '' then
      v_i := 0;
      foreach v_arg in array string_to_array(v_expected.arg_types,',') loop
        v_expected_arg_oid := to_regtype(v_arg);
        if v_proc.proargtypes[v_i] <> v_expected_arg_oid then raise exception '123 contract failed: argument % position %',v_expected.name,v_i+1; end if;
        v_i := v_i + 1;
      end loop;
    end if;
    if v_expected.permission<>'' and position('has_permission('''||v_expected.permission||''')' in replace(replace(v_proc.prosrc,' ',''),E'\n',''))=0 then raise exception '123 contract failed: exact permission guard missing for %',v_expected.name; end if;
     if v_expected.name='has_permission' and (position('dmp_profile_has_permission' in v_proc.prosrc)=0 or position('primary_area' in v_proc.prosrc)>0) then raise exception '123 contract failed: canonical permission source'; end if;
     if v_expected.name='dmp_profile_has_permission' and (position('profile_roles' in v_proc.prosrc)=0 or position('profile_permission_grants' in v_proc.prosrc)=0 or position('primary_area' in v_proc.prosrc)>0) then raise exception '123 contract failed: canonical permission source'; end if;
    if exists(select 1 from aclexplode(coalesce(v_proc.proacl,acldefault('f',v_proc.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') or has_function_privilege('anon',v_proc.oid,'EXECUTE') or not has_function_privilege('authenticated',v_proc.oid,'EXECUTE') then raise exception '123 contract failed: RPC ACL %',v_expected.name; end if;
    if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=v_proc.oid and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception '123 contract failed: explicit PUBLIC ACL %',v_expected.name; end if;
   end loop;
   if (select position('p_payload ? ''active''' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0
      or (select position('has_permission(''users.deactivate'')' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0
      or (select position('has_permission(''users.update'')' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0 then
     raise exception '123 contract failed: update/deactivate permission boundary';
   end if;
   if (select position('jsonb_object_keys(p_payload)' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0
      or (select position('no hay cambios de usuario' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0
      or (select position('campo de usuario no permitido' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0 then
     raise exception '123 contract failed: admin payload boundary';
   end if;
   if (select position('v_old.id and r.name = ''superadmin''' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0 then
     raise exception '123 contract failed: tenant superadmin target protection';
   end if;
   if (select position('target_role.name = ''superadmin''' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_can_manage_tenant_superadmin_target' and p.pronargs=1) = 0
      or (select position('actor_role.name = ''superadmin''' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_can_manage_tenant_superadmin_target' and p.pronargs=1) = 0
      or (select position('public.is_platform_superadmin()' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_can_manage_tenant_superadmin_target' and p.pronargs=1) = 0 then
     raise exception '123 contract failed: tenant superadmin target helper';
   end if;
   foreach v_name in array array['dmp_admin_update_user','dmp_admin_update_user_access'] loop
     if (select position('dmp_can_manage_tenant_superadmin_target' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name) = 0 then raise exception '123 contract failed: target protection missing %',v_name; end if;
   end loop;
   if (select position('not public.is_platform_superadmin() and v_old.company_id <> v_actor.company_id' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user' and p.pronargs=2) = 0
      or (select position('not public.is_platform_superadmin() and v_target.company_id <> v_actor.company_id' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_update_user_access' and p.pronargs=4) = 0 then
     raise exception '123 contract failed: platform-only cross-tenant bypass';
   end if;
   if (select position('p_ordered_quantity is null' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_purchase_order_line' and p.pronargs=5) = 0
      or (select position('p_ordered_quantity<=0' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_purchase_order_line' and p.pronargs=5) = 0
      or (select position('p_unit_purchase_price<0' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_purchase_order_line' and p.pronargs=5) = 0
      or (select position('has_permission(''purchase_orders.update'')' in p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_purchase_order_line' and p.pronargs=5) = 0 then
     raise exception '123 contract failed: purchase line update validation';
   end if;
   if position('dmp_module_default_visible' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_get_current_access' and p.pronargs=0)) = 0
      or position('dmp_module_default_visible' in (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_admin_get_user_access' and p.pronargs=1)) = 0 then
     raise exception '123 contract failed: inconsistent module default visibility';
   end if;
   foreach v_name in array array['has_permission(text)','dmp_admin_list_users()','dmp_admin_update_user(uuid,jsonb)','dmp_admin_get_user_access(uuid)','dmp_admin_update_user_access(uuid,text[],jsonb,jsonb)','dmp_get_current_access()','dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)'] loop
     if has_function_privilege('anon',to_regprocedure('public.'||v_name),'EXECUTE') or not has_function_privilege('authenticated',to_regprocedure('public.'||v_name),'EXECUTE') then raise exception '123 contract failed: ACL %',v_name; end if;
    if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure('public.'||v_name) and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception '123 contract failed: explicit PUBLIC ACL %',v_name; end if;
  end loop;
  foreach v_name in array array['permissions:code','role_permissions:role_id','role_permissions:permission_id','profile_permission_grants:profile_id','profile_permission_grants:permission_id','app_modules:code','profile_module_visibility:profile_id','profile_module_visibility:module_id'] loop
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=split_part(v_name,':',1) and column_name=split_part(v_name,':',2)) then raise exception '123 contract failed: column %',v_name; end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.permissions'::regclass and contype='p') or not exists(select 1 from pg_constraint where conrelid='public.role_permissions'::regclass and contype='p') or not exists(select 1 from pg_constraint where conrelid='public.profile_permission_grants'::regclass and contype='p') or not exists(select 1 from pg_constraint where conrelid='public.app_modules'::regclass and contype='p') or not exists(select 1 from pg_constraint where conrelid='public.profile_module_visibility'::regclass and contype='p') then raise exception '123 contract failed: primary key'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='permissions' and column_name='created_at' and column_default like '%now()%') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_modules' and column_name='active' and column_default like '%true%') then raise exception '123 contract failed: defaults'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and policyname='permissions_authenticated_read') then raise exception '123 contract failed: permissions policy'; end if;
  for v_expected in select * from (values
    ('purchase_orders_select_backoffice','purchase_orders','SELECT','purchase_orders.read'),
    ('purchase_orders_insert_backoffice','purchase_orders','INSERT','purchase_orders.create'),
    ('purchase_orders_update_backoffice','purchase_orders','UPDATE','purchase_orders.update'),
    ('purchase_order_lines_select_backoffice','purchase_order_lines','SELECT','purchase_orders.read'),
    ('purchase_order_lines_insert_backoffice','purchase_order_lines','INSERT','purchase_orders.update'),
    ('purchase_order_lines_update_backoffice','purchase_order_lines','UPDATE','purchase_orders.update'),
    ('purchase_receipts_select_backoffice','purchase_receipts','SELECT','purchase_receipts.read'),
    ('purchase_receipt_lines_select_backoffice','purchase_receipt_lines','SELECT','purchase_receipts.read'),
    ('suppliers_select_backoffice','suppliers','SELECT','suppliers.read'),
    ('suppliers_insert_backoffice','suppliers','INSERT','suppliers.create'),
    ('suppliers_update_backoffice','suppliers','UPDATE','suppliers.update'),
    ('material_suppliers_select_backoffice','material_suppliers','SELECT','suppliers.read'),
    ('material_suppliers_insert_backoffice','material_suppliers','INSERT','suppliers.update'),
    ('material_suppliers_update_backoffice','material_suppliers','UPDATE','suppliers.update'),
    ('materials_select_backoffice','materials','SELECT','materials.read'),
    ('materials_write_backoffice','materials','INSERT','materials.create'),
    ('materials_update_stock_backoffice','materials','UPDATE','materials.update'),
    ('warehouse_stock_select_backoffice','warehouse_stock','SELECT','stock.read')) policy(policy_name,table_name,command_name,permission)
  loop
    select * into v_proc from pg_policies where schemaname='public' and policyname=v_expected.policy_name and tablename=v_expected.table_name and cmd=v_expected.command_name;
    if v_proc.policyname is null or position('authenticated' in array_to_string(v_proc.roles, ',')) = 0 then raise exception '123 contract failed: RLS policy %',v_expected.policy_name; end if;
    v_using_expr := translate(coalesce(v_proc.qual,''), E' \n\r\t', '');
    v_check_expr := translate(coalesce(v_proc.with_check,''), E' \n\r\t', '');
    if v_expected.command_name in ('SELECT','UPDATE','DELETE') and (position('is_platform_superadmin()' in v_using_expr) = 0 or position('current_company_id()' in v_using_expr) = 0 or position('has_permission(' in v_using_expr) = 0 or position(quote_literal(v_expected.permission) in v_using_expr) = 0) then raise exception '123 contract failed: RLS USING scope %',v_expected.policy_name; end if;
    if v_expected.command_name in ('INSERT','UPDATE') and (position('is_platform_superadmin()' in v_check_expr) = 0 or position('current_company_id()' in v_check_expr) = 0 or position('has_permission(' in v_check_expr) = 0 or position(quote_literal(v_expected.permission) in v_check_expr) = 0) then raise exception '123 contract failed: RLS WITH CHECK scope %',v_expected.policy_name; end if;
  end loop;
end $$;
select 'verify_123_auth_rbac_navigation: PASS' as result;
