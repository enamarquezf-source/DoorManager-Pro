-- Read-only structural verification for PURCHASE-INTERNAL-REFERENCE-013.
do $verify$
declare
  v_table oid := to_regclass('public.purchase_orders');
  v_oid oid;
  v_proc pg_proc%rowtype;
  v_source text;
  v_arguments text;
begin
  if v_table is null then raise exception '129 contract failed: purchase_orders missing'; end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'purchase_orders' and table_type = 'BASE TABLE') then raise exception '129 contract failed: exact purchase_orders table'; end if;
  foreach v_source in array array['internal_reference','supplier_reference'] loop
    if not exists (select 1 from information_schema.columns i join pg_attribute a on a.attrelid = v_table and a.attname = i.column_name and not a.attisdropped where i.table_schema = 'public' and i.table_name = 'purchase_orders' and i.column_name = v_source and i.data_type = 'text' and i.is_nullable = 'YES' and i.column_default is null and not a.attnotnull and not a.atthasdef) then raise exception '129 contract failed: exact % column', v_source; end if;
  end loop;
  if not exists (select 1 from pg_class where oid = v_table and relrowsecurity) then raise exception '129 contract failed: purchase_orders RLS disabled'; end if;

  if to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text)') is null or to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text,text)') is null or to_regprocedure('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text)') is null or to_regprocedure('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text,text)') is null then raise exception '129 contract failed: exact RPC signatures missing'; end if;

  v_oid := to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text)');
  select * into v_proc from pg_proc where oid = v_oid;
  v_arguments := lower(regexp_replace(pg_get_function_arguments(v_oid), '\s+', ' ', 'g'));
  if v_proc.pronargdefaults <> 4 or v_arguments !~ 'p_order_date date default current_date' or v_arguments !~ 'p_destination_warehouse_id uuid default null' or v_arguments !~ 'p_supplier_reference text default null' or v_arguments !~ 'p_notes text default null' then raise exception '129 contract failed: create wrapper defaults'; end if;

  v_oid := to_regprocedure('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text)');
  select * into v_proc from pg_proc where oid = v_oid;
  v_arguments := lower(regexp_replace(pg_get_function_arguments(v_oid), '\s+', ' ', 'g'));
  if v_proc.pronargdefaults <> 3 or v_arguments !~ 'p_destination_warehouse_id uuid default null' or v_arguments !~ 'p_supplier_reference text default null' or v_arguments !~ 'p_notes text default null' or v_arguments ~ 'p_order_date date default' then raise exception '129 contract failed: update wrapper defaults'; end if;

  foreach v_oid in array array[to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text)'), to_regprocedure('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text)'), to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text,text)'), to_regprocedure('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text,text)')] loop
    select * into v_proc from pg_proc where oid = v_oid; v_source := lower(regexp_replace(v_proc.prosrc, '\s+', '', 'g'));
    if not v_proc.prosecdef or not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then raise exception '129 contract failed: RPC security'; end if;
    if exists (select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') or has_function_privilege('anon', v_oid, 'EXECUTE') or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then raise exception '129 contract failed: RPC ACL'; end if;
    if v_proc.pronargs = 7 and v_proc.pronargdefaults <> 0 then raise exception '129 contract failed: canonical defaults'; end if;
    if v_proc.pronargs = 7 and (position('internal_reference' in v_source) = 0 or position('supplier_reference' in v_source) = 0 or position('current_company_id' in v_source) = 0 or position('has_permission' in v_source) = 0 or position('is_platform_superadmin' in v_source) = 0) then raise exception '129 contract failed: canonical fields or guards'; end if;
    if v_proc.pronargs = 7 and ((v_proc.proname = 'dmp_create_purchase_order' and position('has_permission(''purchase_orders.create'')' in v_source) = 0) or (v_proc.proname = 'dmp_update_purchase_order' and position('has_permission(''purchase_orders.update'')' in v_source) = 0)) then raise exception '129 contract failed: specific permission guard'; end if;
  end loop;
  if position('dmp_create_purchase_order(p_company_id,p_supplier_id,p_order_date,p_destination_warehouse_id,p_supplier_reference,p_notes,null)' in lower(regexp_replace((select prosrc from pg_proc where oid = to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text)')), '\s+', '', 'g'))) = 0 then raise exception '129 contract failed: create wrapper does not forward NULL internal_reference'; end if;
  v_source := lower(regexp_replace((select prosrc from pg_proc where oid = to_regprocedure('public.dmp_update_purchase_order(uuid,uuid,date,uuid,text,text)')), '\s+', '', 'g'));
  if position('selectinternal_referenceintov_internal_reference' in v_source) = 0 or position('frompublic.purchase_orderswhereid=p_purchase_order_id' in v_source) = 0 or position('dmp_update_purchase_order(p_purchase_order_id,p_supplier_id,p_order_date,p_destination_warehouse_id,p_supplier_reference,p_notes,v_internal_reference)' in v_source) = 0 then raise exception '129 contract failed: update wrapper does not preserve internal_reference'; end if;
end
$verify$;
select 'verify_129_purchase_order_internal_reference: PASS' as result;
