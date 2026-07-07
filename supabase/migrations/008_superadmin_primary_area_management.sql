-- DoorManager Pro - superadmin por primary_area y gestion completa de perfiles

create or replace function public.has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and p.primary_area = role_name
  ) or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and r.name = role_name
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('superadmin');
$$;

drop policy if exists profiles_select_company_or_superadmin on public.profiles;
drop policy if exists profiles_write_superadmin_only on public.profiles;
drop policy if exists profiles_update_superadmin_only on public.profiles;

create policy profiles_select_company_or_superadmin on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());

create policy profiles_insert_superadmin_company on public.profiles
  for insert to authenticated
  with check (public.is_superadmin() and company_id = public.current_company_id());

create policy profiles_update_superadmin_company on public.profiles
  for update to authenticated
  using (public.is_superadmin() and company_id = public.current_company_id())
  with check (public.is_superadmin() and company_id = public.current_company_id());

create or replace function public.superadmin_create_profile(p_profile jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_company_id uuid := coalesce(nullif(p_profile->>'company_id', '')::uuid, public.current_company_id());
begin
  if not public.is_superadmin() then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;
  if v_company_id <> public.current_company_id() then
    raise exception 'No puedes crear usuarios fuera de tu empresa';
  end if;

  insert into public.profiles(company_id, auth_user_id, first_name, last_name, email, phone, primary_area, active)
  values (
    v_company_id,
    nullif(p_profile->>'auth_user_id', '')::uuid,
    nullif(p_profile->>'first_name', ''),
    nullif(p_profile->>'last_name', ''),
    lower(nullif(p_profile->>'email', '')),
    nullif(p_profile->>'phone', ''),
    coalesce(nullif(p_profile->>'primary_area', ''), 'SAT'),
    coalesce((p_profile->>'active')::boolean, true)
  )
  returning * into v_profile;

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'creacion', 'profiles', v_profile.id, 'Usuario creado desde superadmin');

  return v_profile;
end;
$$;

create or replace function public.superadmin_update_profile(p_profile_id uuid, p_profile jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_company_id uuid := public.current_company_id();
begin
  if not public.is_superadmin() then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;

  update public.profiles
  set first_name = coalesce(nullif(p_profile->>'first_name', ''), first_name),
      last_name = coalesce(nullif(p_profile->>'last_name', ''), last_name),
      email = coalesce(lower(nullif(p_profile->>'email', '')), email),
      phone = case when p_profile ? 'phone' then nullif(p_profile->>'phone', '') else phone end,
      auth_user_id = case when p_profile ? 'auth_user_id' then nullif(p_profile->>'auth_user_id', '')::uuid else auth_user_id end,
      primary_area = coalesce(nullif(p_profile->>'primary_area', ''), primary_area),
      active = coalesce((p_profile->>'active')::boolean, active),
      deleted_at = case when p_profile ? 'deleted_at' then nullif(p_profile->>'deleted_at', '')::timestamptz else deleted_at end
  where id = p_profile_id and company_id = v_company_id
  returning * into v_profile;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'modificacion', 'profiles', v_profile.id, 'Usuario actualizado desde superadmin');

  return v_profile;
end;
$$;

grant execute on function public.has_role(text) to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.superadmin_create_profile(jsonb) to authenticated;
grant execute on function public.superadmin_update_profile(uuid, jsonb) to authenticated;
