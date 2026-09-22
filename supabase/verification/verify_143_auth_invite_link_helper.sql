-- Read-only, fail-hard verification for AUTH-1 migration 143.
do $$
declare
  v_oid oid;
  v_acl text;
  v_source text;
  v_public_execute boolean;
begin
  if to_regclass('public.auth_invite_intents') is null then raise exception '143 failed: intent table missing'; end if;
  if to_regprocedure('public.dmp_auth_invite_actor(uuid)') is null then raise exception '143 failed: actor helper missing'; end if;
  if to_regprocedure('public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)') is null then raise exception '143 failed: reserve helper missing'; end if;
  if to_regprocedure('public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)') is null then raise exception '143 failed: record helper missing'; end if;
  if to_regprocedure('public.dmp_admin_release_auth_invite(uuid,uuid,uuid)') is null then raise exception '143 failed: release helper missing'; end if;
  if to_regprocedure('public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)') is null then raise exception '143 failed: finalize helper missing'; end if;

  for v_oid in select to_regprocedure(x)::oid from unnest(array[
    'public.dmp_auth_invite_actor(uuid)',
    'public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)',
    'public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)',
    'public.dmp_admin_release_auth_invite(uuid,uuid,uuid)',
    'public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)'
  ]) x loop
    if not (select prosecdef from pg_proc where oid = v_oid) then raise exception '143 failed: helper is not SECURITY DEFINER'; end if;
    if not (select coalesce('search_path=public' = any(proconfig), false) from pg_proc where oid = v_oid) then raise exception '143 failed: helper search_path is not fixed'; end if;
    v_source := pg_get_functiondef(v_oid);
  end loop;

  if position('profile_roles' in pg_get_functiondef(to_regprocedure('public.dmp_auth_invite_actor(uuid)'))) = 0
     or position('platform_superadmins' in pg_get_functiondef(to_regprocedure('public.dmp_auth_invite_actor(uuid)'))) = 0 then
    raise exception '143 failed: actor role/platform contract missing';
  end if;
  if position('pg_advisory_xact_lock' in pg_get_functiondef(to_regprocedure('public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)'))) = 0
     or position('dmp_auth_invite_actor' in pg_get_functiondef(to_regprocedure('public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)'))) = 0 then
    raise exception '143 failed: reserve authorization/lock missing';
  end if;
  if position('auth.users' in pg_get_functiondef(to_regprocedure('public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)'))) = 0
     or position('auth.users' in pg_get_functiondef(to_regprocedure('public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)'))) = 0 then
    raise exception '143 failed: Auth identity validation missing';
  end if;
  if position('operation_id is distinct from p_operation_id' in pg_get_functiondef(to_regprocedure('public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)'))) = 0
     or position('operation_id is distinct from p_operation_id' in pg_get_functiondef(to_regprocedure('public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)'))) = 0
     or position('v_intent.operation_id = p_operation_id' in pg_get_functiondef(to_regprocedure('public.dmp_admin_release_auth_invite(uuid,uuid,uuid)'))) = 0 then
    raise exception '143 failed: operation ownership missing';
  end if;
  if position('v_intent.auth_user_id is not null' in pg_get_functiondef(to_regprocedure('public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)'))) = 0 then
    raise exception '143 failed: Auth ID immutability missing';
  end if;

  if exists (
    select 1 from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.auth_invite_intents'::regclass and a.grantee = 0 and a.privilege_type = 'SELECT'
  ) then raise exception '143 failed: PUBLIC table access'; end if;
  foreach v_acl in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('anon', 'public.auth_invite_intents', v_acl) then raise exception '143 failed: anon table access: %', v_acl; end if;
    if has_table_privilege('authenticated', 'public.auth_invite_intents', v_acl) then raise exception '143 failed: authenticated table access: %', v_acl; end if;
    if exists (
      select 1 from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.oid = 'public.auth_invite_intents'::regclass and a.grantee = 0 and a.privilege_type = v_acl
    ) then raise exception '143 failed: PUBLIC table access: %', v_acl; end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid = 'public.auth_invite_intents'::regclass) then raise exception '143 failed: intent table RLS disabled'; end if;
  if exists (select 1 from pg_policy where polrelid = 'public.auth_invite_intents'::regclass) then raise exception '143 failed: unexpected intent table policy'; end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.auth_invite_intents'::regclass and c.contype = 'u' and cardinality(c.conkey) = 1 and a.attname = 'profile_id'
  ) then raise exception '143 failed: profile uniqueness missing'; end if;
  if not exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_class tbl on tbl.oid = i.indrelid
    join pg_namespace n on n.oid = tbl.relnamespace
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where idx.relname = 'auth_invite_intents_auth_user_unique'
      and tbl.relname = 'auth_invite_intents'
      and n.nspname = 'public'
      and i.indisunique
      and i.indnatts = 1
      and a.attname = 'auth_user_id'
      and i.indpred is not null
      and lower(pg_get_expr(i.indpred, i.indrelid)) like '%auth_user_id%is not null%'
  ) then raise exception '143 failed: Auth uniqueness/index predicate missing'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.auth_invite_intents'::regclass and pg_get_constraintdef(oid) like '%pending%invited%linked%') then raise exception '143 failed: state constraint missing'; end if;

  for v_acl in select unnest(array[
    'public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)',
    'public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)',
    'public.dmp_admin_release_auth_invite(uuid,uuid,uuid)',
    'public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)'
  ]) loop
    select exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = v_acl::regprocedure::oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then raise exception '143 failed: PUBLIC function execute: %', v_acl; end if;
    if has_function_privilege('anon', v_acl, 'EXECUTE') then raise exception '143 failed: anon function execute: %', v_acl; end if;
    if has_function_privilege('authenticated', v_acl, 'EXECUTE') then raise exception '143 failed: authenticated function execute: %', v_acl; end if;
    if not has_function_privilege('service_role', v_acl, 'EXECUTE') then raise exception '143 failed: service_role function execute missing: %', v_acl; end if;
  end loop;

  for v_acl in select 'public.dmp_auth_invite_actor(uuid)' loop
    select exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = v_acl::regprocedure::oid and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute or has_function_privilege('anon', v_acl, 'EXECUTE') or has_function_privilege('authenticated', v_acl, 'EXECUTE') then
      raise exception '143 failed: internal actor helper exposed';
    end if;
    if has_function_privilege('service_role', v_acl, 'EXECUTE') then raise exception '143 failed: actor helper service_role execute'; end if;
  end loop;

  if position('pg_advisory_xact_lock' in pg_get_functiondef(to_regprocedure('public.dmp_admin_reserve_auth_invite(uuid,uuid,uuid)'))) = 0 then raise exception '143 failed: reserve lock missing'; end if;
  if position('invite_requested' in pg_get_functiondef(to_regprocedure('public.dmp_admin_record_auth_invite(uuid,uuid,uuid,uuid)'))) = 0 then raise exception '143 failed: invite audit missing'; end if;
  if position('invite_and_link' in pg_get_functiondef(to_regprocedure('public.dmp_admin_finalize_auth_invite(uuid,uuid,uuid,uuid)'))) = 0 then raise exception '143 failed: link audit missing'; end if;
end $$;
