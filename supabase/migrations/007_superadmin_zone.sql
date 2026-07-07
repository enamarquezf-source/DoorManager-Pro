-- DoorManager Pro - Superadmin role and secure profile administration

alter table public.roles drop constraint if exists roles_name_check;
alter table public.roles add constraint roles_name_check check (name in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico'));

insert into public.roles (name, description)
values ('superadmin', 'Propietario DMP con permisos globales de administracion')
on conflict (name) do update set description = excluded.description;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('superadmin');
$$;

drop policy if exists profiles_company_policy on public.profiles;
drop policy if exists profile_roles_authenticated_company on public.profile_roles;
drop policy if exists activity_log_company_policy on public.activity_log;
drop policy if exists audit_log_company_policy on public.audit_log;

create policy profiles_select_company_or_superadmin on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id() or public.is_superadmin());

create policy profiles_write_superadmin_only on public.profiles
  for insert to authenticated
  with check (public.is_superadmin() and company_id = public.current_company_id());

create policy profiles_update_superadmin_only on public.profiles
  for update to authenticated
  using (public.is_superadmin() and company_id = public.current_company_id())
  with check (public.is_superadmin() and company_id = public.current_company_id());

create policy profile_roles_select_company_or_superadmin on public.profile_roles
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and (p.company_id = public.current_company_id() or public.is_superadmin())));

create policy profile_roles_write_superadmin_only on public.profile_roles
  for insert to authenticated
  with check (public.is_superadmin() and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()));

create policy profile_roles_delete_superadmin_only on public.profile_roles
  for delete to authenticated
  using (public.is_superadmin() and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()));

create policy activity_log_superadmin_only on public.activity_log
  for select to authenticated
  using (public.is_superadmin() and company_id = public.current_company_id());

create policy audit_log_superadmin_only on public.audit_log
  for select to authenticated
  using (public.is_superadmin() and company_id = public.current_company_id());

create or replace function public.superadmin_create_profile(p_profile jsonb)
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

  insert into public.profiles(company_id, first_name, last_name, email, phone, primary_area, active)
  values (
    v_company_id,
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
      primary_area = coalesce(nullif(p_profile->>'primary_area', ''), primary_area),
      active = coalesce((p_profile->>'active')::boolean, active)
  where id = p_profile_id and company_id = v_company_id
  returning * into v_profile;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'modificacion', 'profiles', v_profile.id, 'Usuario actualizado desde superadmin');

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
  v_company_id uuid := public.current_company_id();
begin
  if not public.is_superadmin() then
    raise exception 'No tienes permiso para gestionar roles';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and company_id = v_company_id) then
    raise exception 'Usuario no encontrado';
  end if;

  delete from public.profile_roles where profile_id = p_profile_id;
  insert into public.profile_roles(profile_id, role_id)
  select p_profile_id, r.id
  from public.roles r
  where r.name = any(p_role_names);

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'modificacion', 'profile_roles', p_profile_id, 'Roles cambiados desde superadmin');
end;
$$;

grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.superadmin_create_profile(jsonb) to authenticated;
grant execute on function public.superadmin_update_profile(uuid, jsonb) to authenticated;
grant execute on function public.superadmin_set_profile_roles(uuid, text[]) to authenticated;

-- Crear el usuario Auth y asignar auth_user_id a usuariomasterpro debe hacerse fuera del codigo,
-- desde Supabase Auth o Edge Function segura. No se almacena ninguna contraseña en Git.
