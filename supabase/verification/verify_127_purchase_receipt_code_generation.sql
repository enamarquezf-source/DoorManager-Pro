-- Read-only verification for PURCHASE-RECEIPT-CODE-001.
do $verify$
declare
  v_oid oid;
  v_source text;
  v_proc pg_proc%rowtype;
  v_expected text[] := array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes','purchase_orders','purchase_receipts'];
  v_table text;
begin
  v_oid := to_regprocedure('public.next_dmp_code(uuid,text,text,boolean,integer)');
  if v_oid is null then raise exception '127 contract failed: next_dmp_code signature missing'; end if;
  select * into v_proc from pg_proc where oid = v_oid;
  v_source := lower(v_proc.prosrc);
  if not v_proc.prosecdef then raise exception '127 contract failed: SECURITY DEFINER missing'; end if;
  if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then raise exception '127 contract failed: search_path missing'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then raise exception '127 contract failed: authenticated execute missing'; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then raise exception '127 contract failed: anon execute present'; end if;
  if exists (select 1 from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') then raise exception '127 contract failed: PUBLIC execute present'; end if;
  if v_source !~ 'p_table_name\s*<>\s*all\s*\(\s*array\s*\[' then raise exception '127 contract failed: explicit allowlist missing'; end if;
  foreach v_table in array v_expected loop
    if position(quote_literal(v_table) in v_source) = 0 then raise exception '127 contract failed: allowlist entry missing: %', v_table; end if;
  end loop;
  if v_source !~ 'execute\s+format' or v_source !~ 'from\s+public\.%i' then raise exception '127 contract failed: identifier-safe query missing'; end if;
  if position('assert_member_of_current_company' in v_source) = 0 or v_source !~ 'where\s+company_id\s*=\s*\$1' then raise exception '127 contract failed: company scope missing'; end if;
  if position('pg_advisory_xact_lock' in v_source) = 0 then raise exception '127 contract failed: advisory lock missing'; end if;
  if v_source !~ 'v_base\s*:=\s*case\s+when\s+p_yearly\s+then' or position('p_prefix' in v_source) = 0 or position('v_year' in v_source) = 0 then raise exception '127 contract failed: format inputs missing'; end if;
  if v_source !~ 'lpad\s*\(\s*v_sequence::text\s*,\s*greatest\s*\(\s*p_width\s*,\s*1\s*\)\s*,\s*''0''\s*\)' then raise exception '127 contract failed: zero padding missing'; end if;
  if position('tabla no permitida para generar codigo' in v_source) = 0 then raise exception '127 contract failed: arbitrary table rejection missing'; end if;

  v_oid := to_regprocedure('public.dmp_create_purchase_receipt(uuid,date,uuid,text,text)');
  if v_oid is null then raise exception '127 contract failed: receipt RPC signature missing'; end if;
  select lower(prosrc) into v_source from pg_proc where oid = v_oid;
  if v_source !~ 'next_dmp_code\s*\(\s*v_company\s*,\s*''purchase_receipts''\s*,\s*''rec''\s*,\s*true\s*,\s*6\s*\)' then raise exception '127 contract failed: receipt code call contract'; end if;
end
$verify$;

select 'verify_127_purchase_receipt_code_generation: PASS' as result;
