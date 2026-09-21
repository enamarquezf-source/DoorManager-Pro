-- Read-only structural verification for migration 140.
do $verify$
declare
  v_oid oid := to_regprocedure('public.dmp_assert_user_management_transition(uuid,boolean,text[])');
  v_proc pg_proc%rowtype;
  v_acl record;
begin
  if v_oid is null then
    raise exception '140 contract failed: internal helper missing';
  end if;

  select * into v_proc from pg_proc where oid = v_oid;
  if not v_proc.prosecdef then
    raise exception '140 contract failed: SECURITY DEFINER missing';
  end if;
  if not coalesce(v_proc.proconfig, array[]::text[]) @> array['search_path=public'] then
    raise exception '140 contract failed: fixed search_path missing';
  end if;
  if has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception '140 contract failed: authenticated EXECUTE remains';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception '140 contract failed: anon EXECUTE remains';
  end if;
  for v_acl in select * from aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) loop
    if v_acl.grantee = 0 and v_acl.privilege_type = 'EXECUTE' then
      raise exception '140 contract failed: PUBLIC EXECUTE remains';
    end if;
  end loop;
end $verify$;
