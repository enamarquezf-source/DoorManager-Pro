-- Read-only, fail-hard verification for AUTH-1 migration 144.
do $$
declare
  v_signature text;
  v_oid oid;
  v_public_execute boolean;
begin
  foreach v_signature in array array[
    'public.dmp_auth_invite_actor(uuid)',
    'public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)',
    'public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)',
    'public.dmp_admin_release_auth_invite(uuid,uuid,uuid)',
    'public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then raise exception '144 failed: function missing: %', v_signature; end if;
    if not (select prosecdef from pg_proc where oid = v_oid) then raise exception '144 failed: SECURITY DEFINER missing: %', v_signature; end if;
    if not (select coalesce('search_path=public' = any(proconfig), false) from pg_proc where oid = v_oid) then raise exception '144 failed: search_path is not fixed: %', v_signature; end if;

    select exists (
      select 1
      from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = v_oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then raise exception '144 failed: PUBLIC EXECUTE: %', v_signature; end if;
    if has_function_privilege('anon', v_signature, 'EXECUTE') then raise exception '144 failed: anon EXECUTE: %', v_signature; end if;
    if has_function_privilege('authenticated', v_signature, 'EXECUTE') then raise exception '144 failed: authenticated EXECUTE: %', v_signature; end if;

    if v_signature = 'public.dmp_auth_invite_actor(uuid)' then
      if has_function_privilege('service_role', v_signature, 'EXECUTE') then raise exception '144 failed: actor helper service_role EXECUTE'; end if;
    elsif not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception '144 failed: operational helper service_role EXECUTE missing: %', v_signature;
    end if;
  end loop;
end $$;
