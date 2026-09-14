-- Read-only verification for PURCHASE-CODE-001.
do $verify$
declare
  v_oid oid;
  v_source text;
  v_proc pg_proc%rowtype;
  v_expected text[] := array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes','purchase_orders'];
  v_table text;
begin
  v_oid := to_regprocedure('public.next_dmp_code(uuid,text,text,boolean,integer)');
  if v_oid is null then
    raise exception '125 contract failed: next_dmp_code signature missing';
  end if;
  select * into v_proc from pg_proc where oid = v_oid;
  v_source := lower(v_proc.prosrc);

  if not v_proc.prosecdef then
    raise exception '125 contract failed: next_dmp_code must be SECURITY DEFINER';
  end if;
  if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
    raise exception '125 contract failed: next_dmp_code search_path';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '125 contract failed: authenticated cannot execute next_dmp_code';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '125 contract failed: anon can execute next_dmp_code';
  end if;
  if exists (
    select 1
    from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception '125 contract failed: PUBLIC can execute next_dmp_code';
  end if;

  if v_source !~ 'p_table_name\s*<>\s*all\s*\(\s*array\s*\[' then
    raise exception '125 contract failed: purchase_orders missing from explicit allowlist';
  end if;
  foreach v_table in array v_expected loop
    if position(quote_literal(v_table) in v_source) = 0 then
      raise exception '125 contract failed: allowlist entry missing: %', v_table;
    end if;
  end loop;
  if v_source !~ 'execute\s+format' or v_source !~ 'from\s+public\.%i' then
    raise exception '125 contract failed: canonical identifier-safe dynamic query missing';
  end if;
  if position('pg_advisory_xact_lock' in v_source) = 0 then
    raise exception '125 contract failed: transaction lock missing';
  end if;
  if position('assert_member_of_current_company' in v_source) = 0
     or v_source !~ 'where\s+company_id\s*=\s*\$1' then
    raise exception '125 contract failed: company scope missing';
  end if;
  if v_source !~ 'v_base\s*:=\s*case\s+when\s+p_yearly\s+then'
     or position('p_prefix' in v_source) = 0
     or position('v_year' in v_source) = 0 then
    raise exception '125 contract failed: canonical base format missing';
  end if;
  if v_source !~ 'lpad\s*\(\s*v_sequence::text\s*,\s*greatest\s*\(\s*p_width\s*,\s*1\s*\)\s*,\s*''0''\s*\)' then
    raise exception '125 contract failed: canonical padding format missing';
  end if;
  if v_source !~ 'return\s+v_base\s*\|\|\s*lpad\s*\(' then
    raise exception '125 contract failed: canonical code concatenation missing';
  end if;
  if position('tabla no permitida para generar codigo' in v_source) = 0 then
    raise exception '125 contract failed: arbitrary table rejection missing';
  end if;

  v_oid := to_regprocedure('public.dmp_create_purchase_order(uuid,uuid,date,uuid,text,text)');
  if v_oid is null then
    raise exception '125 contract failed: dmp_create_purchase_order signature missing';
  end if;
  select lower(prosrc) into v_source from pg_proc where oid = v_oid;
  if v_source !~ 'next_dmp_code\s*\(\s*p_company_id\s*,\s*''purchase_orders''\s*,\s*''ped''\s*,\s*true\s*,\s*6\s*\)' then
    raise exception '125 contract failed: create purchase order code call';
  end if;
end
$verify$;

select 'verify_125_purchase_order_code_generation: PASS' as result;
