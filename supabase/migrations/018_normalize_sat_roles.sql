-- SAT trabaja en un unico workspace operativo. Si un perfil conserva SAT y Comercial,
-- SAT prevalece y Comercial queda reservado a usuarios comerciales puros.

begin;

delete from public.profile_roles pr
using public.roles comercial, public.roles sat
where pr.role_id = comercial.id
  and comercial.name = 'Comercial'
  and sat.name = 'SAT'
  and exists (
    select 1
    from public.profile_roles sat_pr
    where sat_pr.profile_id = pr.profile_id
      and sat_pr.role_id = sat.id
  );

update public.profiles p
set primary_area = 'SAT',
    updated_at = now()
where exists (
  select 1
  from public.profile_roles pr
  join public.roles r on r.id = pr.role_id
  where pr.profile_id = p.id
    and r.name = 'SAT'
)
and p.primary_area <> 'SAT';

create or replace function public.normalize_profile_role_names(
  p_primary_area text,
  p_role_names text[]
)
returns text[]
language sql
immutable
as $$
  select case
    when 'SAT' = any(array_agg(distinct role_name))
      then array_remove(array_agg(distinct role_name), 'Comercial')
    else array_agg(distinct role_name)
  end
  from unnest(array_prepend(p_primary_area, coalesce(p_role_names, array[]::text[]))) role_name
  where role_name is not null and role_name <> ''
$$;

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
  v_profile public.profiles;
  v_company_id uuid := nullif(p_profile->>'company_id', '')::uuid;
  v_roles text[] := public.normalize_profile_role_names(coalesce(nullif(p_profile->>'primary_area', ''), 'SAT'), case when array_length(p_role_names, 1) is null then array[]::text[] else p_role_names end);
  v_primary_area text := case when 'SAT' = any(v_roles) then 'SAT' else coalesce(nullif(p_profile->>'primary_area', ''), v_roles[1], 'SAT') end;
  v_role_count integer;
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;
  if v_company_id is null then
    raise exception 'Debes seleccionar una empresa';
  end if;
  if not exists (select 1 from public.companies where id = v_company_id and active = true) then
    raise exception 'La empresa seleccionada no existe o está inactiva';
  end if;
  if exists (
    select 1 from unnest(v_roles) role_name
    where role_name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')
  ) then
    raise exception 'Rol no válido';
  end if;
  if coalesce(array_length(v_roles, 1), 0) = 0 then
    raise exception 'Debe indicar al menos un rol';
  end if;

  if p_profile_id is null then
    insert into public.profiles(
      company_id, auth_user_id, first_name, last_name, email, phone,
      primary_area, active
    )
    values (
      v_company_id,
      nullif(p_profile->>'auth_user_id', '')::uuid,
      nullif(p_profile->>'first_name', ''),
      nullif(p_profile->>'last_name', ''),
      lower(nullif(p_profile->>'email', '')),
      nullif(p_profile->>'phone', ''),
      v_primary_area,
      coalesce((p_profile->>'active')::boolean, true)
    )
    returning * into v_profile;
  else
    update public.profiles
    set company_id = v_company_id,
        first_name = coalesce(nullif(p_profile->>'first_name', ''), first_name),
        last_name = coalesce(nullif(p_profile->>'last_name', ''), last_name),
        email = coalesce(lower(nullif(p_profile->>'email', '')), email),
        phone = case when p_profile ? 'phone' then nullif(p_profile->>'phone', '') else phone end,
        auth_user_id = case when p_profile ? 'auth_user_id' then nullif(p_profile->>'auth_user_id', '')::uuid else auth_user_id end,
        primary_area = v_primary_area,
        active = coalesce((p_profile->>'active')::boolean, active),
        deleted_at = case when p_profile ? 'deleted_at' then nullif(p_profile->>'deleted_at', '')::timestamptz else deleted_at end
    where id = p_profile_id
    returning * into v_profile;
  end if;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  select count(*) into v_role_count
  from public.roles
  where name = any(v_roles);
  if v_role_count <> array_length(v_roles, 1) then
    raise exception 'Alguno de los roles no existe';
  end if;

  delete from public.profile_roles where profile_id = v_profile.id;
  insert into public.profile_roles(profile_id, role_id)
  select v_profile.id, r.id
  from public.roles r
  where r.name = any(v_roles);

  insert into public.activity_log(
    company_id, actor_profile_id, action, entity_type, entity_id, description
  )
  values (
    v_company_id, public.current_profile_id(), 'modificacion', 'profiles',
    v_profile.id, 'Perfil y roles guardados por propietario global'
  );

  return v_profile;
end;
$$;

create or replace function public.superadmin_set_profile_roles(p_profile_id uuid, p_role_names text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_roles text[] := public.normalize_profile_role_names(null, p_role_names);
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para gestionar roles';
  end if;

  select company_id into v_company_id from public.profiles where id = p_profile_id;
  if v_company_id is null then raise exception 'Usuario no encontrado'; end if;
  if coalesce(array_length(v_roles, 1), 0) = 0 then raise exception 'Debe indicar al menos un rol'; end if;
  if exists (select 1 from unnest(v_roles) requested(name) left join public.roles r on r.name = requested.name where r.id is null) then
    raise exception 'Alguno de los roles no existe';
  end if;

  delete from public.profile_roles where profile_id = p_profile_id;
  insert into public.profile_roles(profile_id, role_id)
  select p_profile_id, id from public.roles where name = any(v_roles);

  update public.profiles
  set primary_area = case when 'SAT' = any(v_roles) then 'SAT' else primary_area end,
      updated_at = now()
  where id = p_profile_id;

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'modificacion', 'profile_roles', p_profile_id, 'Roles actualizados por propietario global');
end;
$$;

grant execute on function public.normalize_profile_role_names(text, text[]) to authenticated;
grant execute on function public.superadmin_save_profile_with_roles(uuid, jsonb, text[]) to authenticated;
grant execute on function public.superadmin_set_profile_roles(uuid, text[]) to authenticated;

commit;
