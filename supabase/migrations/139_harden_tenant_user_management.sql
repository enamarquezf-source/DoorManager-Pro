-- DoorManager Pro - harden tenant user administration invariants.
-- Review and deploy after migration 123. Never changes auth.users from SQL exposed to the browser.
begin;

create or replace function public.dmp_can_manage_tenant_superadmin_target(p_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
begin
  select * into v_actor
  from public.profiles
  where id = public.current_profile_id()
    and active
    and deleted_at is null;

  select * into v_target
  from public.profiles
  where id = p_profile_id;

  if v_actor.id is null or v_target.id is null then
    return false;
  end if;
  if public.is_platform_superadmin() then
    return true;
  end if;
  if v_actor.company_id <> v_target.company_id then
    return false;
  end if;

  return not exists (
    select 1
    from public.profile_roles target_pr
    join public.roles target_role on target_role.id = target_pr.role_id
    where target_pr.profile_id = v_target.id
      and target_role.name = 'superadmin'
  )
  or exists (
    select 1
    from public.profile_roles actor_pr
    join public.roles actor_role on actor_role.id = actor_pr.role_id
    where actor_pr.profile_id = v_actor.id
      and actor_role.name = 'superadmin'
  );
end;
$$;

revoke all on function public.dmp_can_manage_tenant_superadmin_target(uuid) from public, anon, authenticated;

create or replace function public.dmp_can_grant_tenant_superadmin(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor
  from public.profiles
  where id = public.current_profile_id()
    and active
    and deleted_at is null;

  if v_actor.id is null then
    return false;
  end if;
  if public.is_platform_superadmin() then
    return true;
  end if;
  if v_actor.company_id is distinct from p_company_id then
    return false;
  end if;

  return exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = v_actor.id
      and r.name = 'superadmin'
  );
end;
$$;

revoke all on function public.dmp_can_grant_tenant_superadmin(uuid) from public, anon, authenticated;
revoke insert, update, delete on table public.profile_roles from public, anon, authenticated;

create or replace function public.dmp_assert_user_management_transition(
  p_profile_id uuid,
  p_active boolean,
  p_role_names text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_profile_id();
  v_target public.profiles;
  v_company_id uuid;
  v_is_superadmin boolean;
  v_remaining integer;
begin
  select * into v_target
  from public.profiles p
  where p.id = p_profile_id;

  if v_target.id is null then
    return;
  end if;

  select v_target.company_id,
         exists (
           select 1
           from public.profile_roles pr
           join public.roles r on r.id = pr.role_id
            where pr.profile_id = v_target.id and r.name = 'superadmin'
         )
     into v_company_id, v_is_superadmin;

  if not v_is_superadmin or (p_active and 'superadmin' = any(coalesce(p_role_names, array[]::text[]))) then
    return;
  end if;

  -- Serialize all last-Superadmin transitions for one tenant until commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended('dmp:tenant-user-management:' || v_company_id::text, 0));

  select * into v_target
  from public.profiles p
  where p.id = p_profile_id
  for update;

  select v_target.company_id,
         exists (
           select 1
           from public.profile_roles pr
           join public.roles r on r.id = pr.role_id
           where pr.profile_id = v_target.id and r.name = 'superadmin'
         )
    into v_company_id, v_is_superadmin;

  if not v_is_superadmin or (v_target.active = false and not p_active) or (p_active and 'superadmin' = any(coalesce(p_role_names, array[]::text[]))) then
    return;
  end if;

  if p_profile_id = v_actor_id then
    raise exception 'seguridad: no puedes degradar ni desactivar tu propio Superadmin';
  end if;

  select count(*) into v_remaining
  from public.profiles p
  where p.company_id = v_company_id
    and p.id <> p_profile_id
    and p.active
    and p.deleted_at is null
    and exists (
      select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
      where pr.profile_id = p.id and r.name = 'superadmin'
    );

  if v_remaining < 1 then
    raise exception 'seguridad: no puedes dejar la empresa sin Superadmin activo';
  end if;
end;
$$;

revoke all on function public.dmp_assert_user_management_transition(uuid, boolean, text[]) from public, anon;

create or replace function public.dmp_admin_update_user(
  p_profile_id uuid,
  p_payload jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_old public.profiles;
  v_new public.profiles;
  v_roles text[];
  v_active boolean;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or not exists (select 1 from jsonb_object_keys(p_payload)) then
    raise exception 'validacion del formulario: no hay cambios de usuario';
  end if;
  if p_payload ? 'auth_user_id' or p_payload ? 'company_id' then
    raise exception 'seguridad: Auth y empresa no se gestionan desde esta ficha';
  end if;
  if p_payload ? 'primary_area' then
    raise exception 'seguridad: primary_area se sincroniza desde profile_roles';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) key where key not in ('first_name','last_name','email','phone','active')) then
    raise exception 'validacion del formulario: campo de usuario no permitido';
  end if;
  if p_payload ? 'active' and not public.has_permission('users.deactivate') then
    raise exception 'permiso: no puedes activar o desactivar usuarios';
  end if;
  if (p_payload ? 'first_name' or p_payload ? 'last_name' or p_payload ? 'email' or p_payload ? 'phone') and not (public.has_permission('users.update') or public.has_permission('admin.users.update')) then
    raise exception 'permiso: no puedes actualizar usuarios';
  end if;

  select * into v_actor
  from public.profiles
  where id = public.current_profile_id() and active and deleted_at is null;
  select * into v_old
  from public.profiles
  where id = p_profile_id
  for update;
  if v_actor.id is null or v_old.id is null or (not public.is_platform_superadmin() and v_old.company_id <> v_actor.company_id) then
    raise exception 'seguridad: usuario fuera de la empresa';
  end if;
  if not public.dmp_can_manage_tenant_superadmin_target(v_old.id) then
    raise exception 'seguridad: este usuario tiene privilegios de Superadmin';
  end if;

  select coalesce(array_agg(r.name order by pr.role_id), array[]::text[])
    into v_roles
  from public.profile_roles pr
  join public.roles r on r.id = pr.role_id
  where pr.profile_id = v_old.id;
  v_active := case when p_payload ? 'active' then (p_payload->>'active')::boolean else v_old.active end;
  perform public.dmp_assert_user_management_transition(v_old.id, v_active, v_roles);
  if v_old.id = v_actor.id and not v_active then
    raise exception 'seguridad: no puedes desactivar tu propio Superadmin';
  end if;

  update public.profiles set
    first_name = coalesce(nullif(p_payload->>'first_name',''), first_name),
    last_name = coalesce(nullif(p_payload->>'last_name',''), last_name),
    email = coalesce(nullif(lower(p_payload->>'email'),''), email),
    phone = case when p_payload ? 'phone' then nullif(p_payload->>'phone','') else phone end,
    active = v_active,
    updated_at = now()
  where id = v_old.id
  returning * into v_new;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_old.company_id, 'profiles', v_old.id, 'UPDATE', v_actor.id, to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end;
$$;

revoke all on function public.dmp_admin_update_user(uuid, jsonb) from public, anon;
grant execute on function public.dmp_admin_update_user(uuid, jsonb) to authenticated;

create or replace function public.superadmin_save_profile_with_roles(
  p_profile_id uuid default null,
  p_profile jsonb default '{}'::jsonb,
  p_role_names text[] default array[]::text[]
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_profile public.profiles;
  v_old_profile public.profiles;
  v_old_roles text[] := array[]::text[];
  v_roles text[] := array[]::text[];
  v_primary text;
  v_active boolean;
begin
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'validacion del formulario: datos de usuario no válidos';
  end if;
  if p_profile ? 'auth_user_id' or p_profile ? 'company_id' then
    raise exception 'seguridad: Auth y empresa no se gestionan desde esta ficha';
  end if;
  if p_profile ? 'primary_area' then
    raise exception 'seguridad: primary_area se sincroniza desde profile_roles';
  end if;
  if not (public.has_permission('admin.users.update') or public.is_platform_superadmin()) then
    raise exception 'permiso: no puedes gestionar usuarios';
  end if;
  if p_profile_id is null and (p_role_names is null or cardinality(p_role_names) = 0) then
    raise exception 'seguridad: la creación requiere roles explícitos';
  end if;
  if (p_profile_id is null or cardinality(p_role_names) > 0)
     and not (public.has_permission('admin.roles.manage') or public.is_platform_superadmin()) then
    raise exception 'permiso: no puedes gestionar roles';
  end if;

  select * into v_actor
  from public.profiles
  where id = public.current_profile_id() and active and deleted_at is null;
  if v_actor.id is null then raise exception 'seguridad: perfil administrador no disponible'; end if;

  if p_profile_id is null then
    v_roles := p_role_names;
    if exists (select 1 from unnest(v_roles) role_name where role_name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then
      raise exception 'seguridad: rol no permitido';
    end if;
    if 'SAT' = any(v_roles) and 'Comercial' = any(v_roles) then
      raise exception 'validacion del formulario: SAT y Comercial son incompatibles';
    end if;
    if 'superadmin' = any(v_roles) and not public.dmp_can_grant_tenant_superadmin(public.current_company_id()) then
      raise exception 'seguridad: no puedes conceder privilegios de Superadmin';
    end if;
    v_primary := v_roles[1];
    v_active := coalesce((p_profile->>'active')::boolean, true);
    insert into public.profiles(company_id, auth_user_id, first_name, last_name, email, phone, primary_area, active)
    values (public.current_company_id(), null, nullif(p_profile->>'first_name',''), nullif(p_profile->>'last_name',''), lower(nullif(p_profile->>'email','')), nullif(p_profile->>'phone',''), v_primary, v_active)
    returning * into v_profile;
  else
    select * into v_profile from public.profiles where id = p_profile_id for update;
    v_old_profile := v_profile;
    select coalesce(array_agg(r.name order by pr.role_id), array[]::text[])
      into v_old_roles
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = v_profile.id;
    if v_profile.id is null or (not public.is_platform_superadmin() and v_profile.company_id <> v_actor.company_id) then
      raise exception 'seguridad: usuario fuera de la empresa';
    end if;
    if not public.dmp_can_manage_tenant_superadmin_target(v_profile.id) then
      raise exception 'seguridad: este usuario tiene privilegios de Superadmin';
    end if;
    if p_role_names is null or cardinality(p_role_names) = 0 then
      select coalesce(array_agg(r.name order by pr.role_id), array[]::text[])
        into v_roles
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
      where pr.profile_id = v_profile.id;
    else
      v_roles := p_role_names;
    end if;
    if cardinality(v_roles) = 0 or exists (select 1 from unnest(v_roles) role_name where role_name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then
      raise exception 'seguridad: debe existir al menos un rol';
    end if;
    if 'SAT' = any(v_roles) and 'Comercial' = any(v_roles) then
      raise exception 'validacion del formulario: SAT y Comercial son incompatibles';
    end if;
    if 'superadmin' = any(v_roles)
       and not exists (
         select 1
         from public.profile_roles pr
         join public.roles r on r.id = pr.role_id
         where pr.profile_id = v_profile.id and r.name = 'superadmin'
       )
       and not public.dmp_can_grant_tenant_superadmin(v_profile.company_id) then
      raise exception 'seguridad: no puedes conceder privilegios de Superadmin';
    end if;
    v_active := case when p_profile ? 'active' then (p_profile->>'active')::boolean else v_profile.active end;
    if v_profile.id = v_actor.id and (not v_active or not exists (
      select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id
      where pr.profile_id = v_profile.id and r.name = any(v_roles)
    ) or exists (
      select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id
      where pr.profile_id = v_profile.id and r.name = 'superadmin' and not ('superadmin' = any(v_roles))
    )) then
      raise exception 'seguridad: no puedes degradar ni desactivar tu propio Superadmin';
    end if;
    perform public.dmp_assert_user_management_transition(v_profile.id, v_active, v_roles);
    v_primary := v_roles[1];
    update public.profiles
    set first_name = coalesce(nullif(p_profile->>'first_name',''), first_name),
        last_name = coalesce(nullif(p_profile->>'last_name',''), last_name),
        email = coalesce(lower(nullif(p_profile->>'email','')), email),
        phone = case when p_profile ? 'phone' then nullif(p_profile->>'phone','') else phone end,
        primary_area = v_primary,
        active = v_active,
        updated_at = now()
    where id = v_profile.id
    returning * into v_profile;
  end if;

  delete from public.profile_roles where profile_id = v_profile.id;
  insert into public.profile_roles(profile_id, role_id)
  select v_profile.id, r.id from public.roles r where r.name = any(v_roles);
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (
    v_profile.company_id,
    'profiles',
    v_profile.id,
    case when p_profile_id is null then 'INSERT' else 'UPDATE' end,
    v_actor.id,
    case when p_profile_id is null then null else jsonb_build_object('profile', to_jsonb(v_old_profile), 'roles', to_jsonb(v_old_roles)) end,
    jsonb_build_object('profile', to_jsonb(v_profile), 'roles', to_jsonb(v_roles))
  );
  return v_profile;
end;
$$;

revoke all on function public.superadmin_save_profile_with_roles(uuid, jsonb, text[]) from public, anon;
grant execute on function public.superadmin_save_profile_with_roles(uuid, jsonb, text[]) to authenticated;

-- Direct access mutations must enforce the same last-admin invariant as the profile RPC.
create or replace function public.dmp_admin_update_user_access(
  p_profile_id uuid,
  p_role_names text[] default null,
  p_permission_grants jsonb default '[]'::jsonb,
  p_module_visibility jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_item jsonb;
  v_code text;
  v_permission_id uuid;
  v_module_id uuid;
  v_old_roles jsonb;
  v_old_grants jsonb;
  v_old_modules jsonb;
begin
  if p_role_names is null and jsonb_array_length(coalesce(p_permission_grants, '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(p_module_visibility, '[]'::jsonb)) = 0 then raise exception 'seguridad: no hay cambios de acceso'; end if;
  select * into v_actor from public.profiles where id = public.current_profile_id() and active and deleted_at is null;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_actor.id is null or v_target.id is null or (not public.is_platform_superadmin() and v_target.company_id <> v_actor.company_id) then
    raise exception 'seguridad: usuario fuera de la empresa';
  end if;
  if v_target.id = v_actor.id then raise exception 'seguridad: no puedes elevar ni bloquear tu propio acceso'; end if;
  if not public.dmp_can_manage_tenant_superadmin_target(v_target.id) then raise exception 'seguridad: este usuario tiene privilegios de Superadmin'; end if;
  if p_role_names is not null and not public.has_permission('admin.roles.manage') then raise exception 'permiso: no puedes gestionar roles'; end if;
  if jsonb_array_length(coalesce(p_permission_grants, '[]'::jsonb)) > 0 and not public.has_permission('admin.roles.manage') then raise exception 'permiso: no puedes gestionar permisos'; end if;
  if jsonb_array_length(coalesce(p_module_visibility, '[]'::jsonb)) > 0 and not public.has_permission('admin.modules.manage') then raise exception 'permiso: no puedes gestionar modulos'; end if;
  if p_role_names is not null and cardinality(p_role_names) = 0 then raise exception 'seguridad: debe existir al menos un rol'; end if;
  if p_role_names is not null and exists (select 1 from unnest(p_role_names) n where n not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then raise exception 'seguridad: rol no permitido'; end if;
  if p_role_names is not null and 'SAT' = any(p_role_names) and 'Comercial' = any(p_role_names) then raise exception 'validacion del formulario: SAT y Comercial son incompatibles'; end if;
  if p_role_names is not null
     and 'superadmin' = any(p_role_names)
     and not exists (
       select 1
       from public.profile_roles pr
       join public.roles r on r.id = pr.role_id
       where pr.profile_id = v_target.id and r.name = 'superadmin'
     )
     and not public.dmp_can_grant_tenant_superadmin(v_target.company_id) then
    raise exception 'seguridad: no puedes conceder privilegios de Superadmin';
  end if;
  if p_role_names is not null then perform public.dmp_assert_user_management_transition(v_target.id, v_target.active, p_role_names); end if;

  select coalesce(jsonb_agg(r.name order by r.name), '[]'::jsonb) into v_old_roles from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_target.id;
  select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'granted', g.granted) order by x.code), '[]'::jsonb) into v_old_grants from public.profile_permission_grants g join public.permissions x on x.id = g.permission_id where g.profile_id = v_target.id;
  select coalesce(jsonb_agg(jsonb_build_object('code', m.code, 'visible', v.visible) order by m.code), '[]'::jsonb) into v_old_modules from public.profile_module_visibility v join public.app_modules m on m.id = v.module_id where v.profile_id = v_target.id;
  if p_role_names is not null then
    delete from public.profile_roles where profile_id = v_target.id;
    insert into public.profile_roles(profile_id, role_id) select v_target.id, r.id from public.roles r where r.name = any(p_role_names);
    update public.profiles set primary_area = coalesce((select r.name from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = v_target.id and r.name = any(p_role_names) order by array_position(p_role_names, r.name) limit 1), primary_area), updated_at = now() where id = v_target.id;
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_permission_grants, '[]'::jsonb)) loop
    v_code := nullif(v_item->>'code', '');
    select id into v_permission_id from public.permissions where code = v_code;
    if v_permission_id is null or not (v_item ? 'granted') then raise exception 'seguridad: permiso invalido'; end if;
    if (v_item->>'granted')::boolean then
      insert into public.profile_permission_grants(profile_id, permission_id, granted, updated_at) values (v_target.id, v_permission_id, true, now()) on conflict (profile_id, permission_id) do update set granted = true, updated_at = now();
    else
      delete from public.profile_permission_grants where profile_id = v_target.id and permission_id = v_permission_id;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_module_visibility, '[]'::jsonb)) loop
    v_code := nullif(v_item->>'code', '');
    select id into v_module_id from public.app_modules where code = v_code and active;
    if v_module_id is null or not (v_item ? 'visible') then raise exception 'seguridad: modulo invalido'; end if;
    insert into public.profile_module_visibility(profile_id, module_id, visible, updated_at) values (v_target.id, v_module_id, (v_item->>'visible')::boolean, now()) on conflict (profile_id, module_id) do update set visible = excluded.visible, updated_at = now();
  end loop;
  if p_role_names is not null then insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, 'profile_roles', v_target.id, 'UPDATE', v_actor.id, v_old_roles, to_jsonb(p_role_names)); end if;
  if jsonb_array_length(coalesce(p_permission_grants, '[]'::jsonb)) > 0 then insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, 'profile_permission_grants', v_target.id, 'UPDATE', v_actor.id, v_old_grants, p_permission_grants); end if;
  if jsonb_array_length(coalesce(p_module_visibility, '[]'::jsonb)) > 0 then insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, 'profile_module_visibility', v_target.id, 'UPDATE', v_actor.id, v_old_modules, p_module_visibility); end if;
  return public.dmp_admin_get_user_access(v_target.id);
end;
$$;

revoke all on function public.dmp_admin_update_user_access(uuid, text[], jsonb, jsonb) from public, anon;
grant execute on function public.dmp_admin_update_user_access(uuid, text[], jsonb, jsonb) to authenticated;

-- These historical entry points are no longer part of the supported contract.
-- Keep the functions for migration compatibility, but make them unreachable by clients.
revoke all on function public.superadmin_create_profile(jsonb) from public, anon, authenticated;
revoke all on function public.superadmin_update_profile(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.superadmin_set_profile_roles(uuid, text[]) from public, anon, authenticated;

commit;
