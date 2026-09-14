-- Read-only verification for PURCHASE-ORDER-LIFECYCLE-001.
do $verify$
declare
  v_oid oid;
  v_proc pg_proc%rowtype;
  v_source text;
  v_column record;
  v_policy record;
begin
  select * into v_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'purchase_orders'
    and column_name = 'archived_at';
  if not found then raise exception '126 contract failed: archived_at missing'; end if;
  if v_column.data_type <> 'timestamp with time zone'
     or v_column.is_nullable <> 'YES'
     or v_column.column_default is not null then
    raise exception '126 contract failed: archived_at type/nullability/default';
  end if;

  v_oid := to_regprocedure('public.dmp_archive_purchase_order(uuid,text)');
  if v_oid is null then raise exception '126 contract failed: archive RPC missing'; end if;
  select * into v_proc from pg_proc where oid = v_oid;
  if not v_proc.prosecdef then raise exception '126 contract failed: archive RPC must be SECURITY DEFINER'; end if;
  if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
    raise exception '126 contract failed: archive RPC search_path';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '126 contract failed: authenticated cannot execute archive RPC';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '126 contract failed: anon can execute archive RPC';
  end if;
  if exists (
    select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception '126 contract failed: PUBLIC can execute archive RPC';
  end if;

  v_source := lower(v_proc.prosrc);
  if position('v_order.deleted_at' in v_source) > 0 or position('set deleted_at' in v_source) > 0 then raise exception '126 contract failed: archive RPC uses deleted_at for archival'; end if;
  if position('archived_at' in v_source) = 0 then raise exception '126 contract failed: archive field missing from RPC'; end if;
  if v_source !~ 'company_id[[:space:]]*=[[:space:]]*public[.]current_company_id[[:space:]]*[(][[:space:]]*[)]' then raise exception '126 contract failed: current company scope missing'; end if;
  if position('public.current_company_id()' in v_source) = 0 then raise exception '126 contract failed: current company check missing'; end if;
  if position('auth.uid()' in v_source) = 0 or position('public.current_profile_id()' in v_source) = 0 then raise exception '126 contract failed: current actor check missing'; end if;
  if position('active = true' in v_source) = 0 or position('deleted_at is null' in v_source) = 0 then raise exception '126 contract failed: active actor check missing'; end if;
  if v_source !~ 'has_permission[[:space:]]*[(][[:space:]]*''purchase_orders[.]update''[[:space:]]*[)]' then raise exception '126 contract failed: archive permission missing'; end if;
  if v_source !~ 'status[[:space:]]+not[[:space:]]+in[[:space:]]*[(][^)]*cancelled[^)]*received[^)]*[)]' then raise exception '126 contract failed: archivable state guard missing'; end if;
  if position('cancelled' in v_source) = 0 or position('received' in v_source) = 0 or position('solo se pueden archivar' in v_source) = 0 then raise exception '126 contract failed: state rejection contract missing'; end if;
  if v_source !~ 'archived_at[[:space:]]+is[[:space:]]+not[[:space:]]+null' then raise exception '126 contract failed: already-archived guard missing'; end if;
  if position('el pedido ya está archivado' in v_source) = 0 then raise exception '126 contract failed: repeated archive error missing'; end if;
  if to_regprocedure('public.dmp_record_lifecycle_audit(uuid,public.profiles,text,uuid,text,text,jsonb,jsonb)') is null then
    raise exception '126 contract failed: canonical audit signature missing';
  end if;
  if position('dmp_record_lifecycle_audit' in v_source) = 0 or position('''archive''' in v_source) = 0 then
    raise exception '126 contract failed: canonical archive audit missing';
  end if;
  if position('delete from public.purchase_orders' in v_source) > 0
     or position('delete from public.purchase_order_lines' in v_source) > 0
     or position('delete from public.purchase_receipts' in v_source) > 0
     or position('delete from public.purchase_receipt_lines' in v_source) > 0
     or position('delete from public.stock_movements' in v_source) > 0 then
    raise exception '126 contract failed: physical or historical delete present';
  end if;

  for v_policy in
    select * from (values
      ('purchase_orders_select_backoffice'),
      ('purchase_orders_platform_superadmin_select')
    ) expected(policy_name)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'purchase_orders'
        and p.policyname = v_policy.policy_name
        and p.cmd = 'SELECT'
        and position('archived_at' in lower(coalesce(p.qual, ''))) = 0
    ) then
      raise exception '126 contract failed: archived orders must remain readable: %', v_policy.policy_name;
    end if;
  end loop;
end
$verify$;

select 'verify_126_purchase_order_archive: PASS' as result;
