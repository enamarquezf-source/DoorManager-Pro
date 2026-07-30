-- DoorManager Pro - propietario global de plataforma y ámbito por empresa
--
-- El rol superadmin representa al propietario de DoorManager Pro. Puede consultar
-- y administrar todas las empresas. El resto de roles continúa aislado por
-- current_company_id() mediante sus políticas existentes.

create or replace function public.is_platform_superadmin()
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
      and (
        p.primary_area = 'superadmin'
        or exists (
          select 1
          from public.profile_roles pr
          join public.roles r on r.id = pr.role_id
          where pr.profile_id = p.id
            and r.name = 'superadmin'
        )
      )
  );
$$;

grant execute on function public.is_platform_superadmin() to authenticated;

create or replace function public.assert_member_of_current_company(p_company_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_superadmin() and not public.is_company_member(p_company_id) then
    raise exception 'El usuario no pertenece a esta empresa';
  end if;
  if public.is_platform_superadmin()
     and not exists (select 1 from public.companies where id = p_company_id and active = true) then
    raise exception 'La empresa seleccionada no existe o está inactiva';
  end if;
end;
$$;

grant execute on function public.assert_member_of_current_company(uuid) to authenticated;

-- Empresas: lectura y administración global, sin borrado físico.
drop policy if exists companies_platform_superadmin_select on public.companies;
drop policy if exists companies_platform_superadmin_insert on public.companies;
drop policy if exists companies_platform_superadmin_update on public.companies;
create policy companies_platform_superadmin_select on public.companies
  for select to authenticated using (public.is_platform_superadmin());
create policy companies_platform_superadmin_insert on public.companies
  for insert to authenticated with check (public.is_platform_superadmin());
create policy companies_platform_superadmin_update on public.companies
  for update to authenticated using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- Datos con company_id que el propietario debe poder gestionar globalmente.
-- Las políticas son adicionales y solo se activan para is_platform_superadmin().
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'clients', 'client_contacts', 'sites', 'site_contacts',
    'access_requirements', 'equipment_types', 'equipment',
    'equipment_components', 'equipment_photos', 'equipment_status_history',
    'cases', 'case_events', 'case_links', 'case_documents',
    'work_orders', 'work_order_equipment', 'work_order_assignments',
    'work_order_status_history', 'work_order_notes', 'work_order_materials',
    'work_order_photos', 'work_order_signatures',
    'checks', 'check_section_results', 'check_item_results', 'check_photos',
    'deficiencies', 'corrective_actions', 'alerts', 'alert_recipients',
    'documents', 'document_links', 'files',
    'check_templates', 'check_template_sections', 'check_template_items',
    'materials', 'material_requests', 'stock_movements',
    'warehouses', 'warehouse_stock', 'suppliers', 'opportunities', 'quotes',
    'quote_lines', 'activity_log', 'audit_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_platform_superadmin_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_platform_superadmin_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_platform_superadmin_update', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_platform_superadmin())',
      table_name || '_platform_superadmin_select', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_platform_superadmin())',
      table_name || '_platform_superadmin_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_platform_superadmin()) with check (public.is_platform_superadmin())',
      table_name || '_platform_superadmin_update', table_name
    );
  end loop;
end $$;

drop policy if exists profile_roles_platform_superadmin_select on public.profile_roles;
drop policy if exists profile_roles_platform_superadmin_insert on public.profile_roles;
drop policy if exists profile_roles_platform_superadmin_delete on public.profile_roles;
create policy profile_roles_platform_superadmin_select on public.profile_roles
  for select to authenticated using (public.is_platform_superadmin());
create policy profile_roles_platform_superadmin_insert on public.profile_roles
  for insert to authenticated with check (public.is_platform_superadmin());
create policy profile_roles_platform_superadmin_delete on public.profile_roles
  for delete to authenticated using (public.is_platform_superadmin());

create or replace function public.superadmin_global_overview(p_company_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para consultar el ámbito global';
  end if;

  return jsonb_build_object(
    'companies', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.name), '[]'::jsonb)
      from public.companies c
      where p_company_id is null or c.id = p_company_id
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
      from public.profiles p
      where p.deleted_at is null
        and (p_company_id is null or p.company_id = p_company_id)
    ),
    'clients', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
      from public.clients c
      where c.deleted_at is null
        and (p_company_id is null or c.company_id = p_company_id)
    ),
    'sites', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from public.sites s
      where s.deleted_at is null
        and (p_company_id is null or s.company_id = p_company_id)
    ),
    'equipment', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
      from public.equipment e
      where e.deleted_at is null
        and (p_company_id is null or e.company_id = p_company_id)
    ),
    'work_orders', (
      select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb)
      from public.work_orders w
      where w.deleted_at is null
        and (p_company_id is null or w.company_id = p_company_id)
    ),
    'checks', (
      select coalesce(jsonb_agg(to_jsonb(ch) order by ch.created_at desc), '[]'::jsonb)
      from public.checks ch
      where ch.deleted_at is null
        and (p_company_id is null or ch.company_id = p_company_id)
    ),
    'activity', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
      from (
        select *
        from public.activity_log al
        where p_company_id is null or al.company_id = p_company_id
        order by al.created_at desc
        limit 50
      ) a
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.changed_at desc), '[]'::jsonb)
      from (
        select *
        from public.audit_log au
        where p_company_id is null or au.company_id = p_company_id
        order by au.changed_at desc
        limit 100
      ) a
    )
  );
end;
$$;

grant execute on function public.superadmin_global_overview(uuid) to authenticated;

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
  v_roles text[] := case
    when array_length(p_role_names, 1) is null
      then array[coalesce(nullif(p_profile->>'primary_area', ''), 'SAT')]
    else p_role_names
  end;
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
      coalesce(nullif(p_profile->>'primary_area', ''), 'SAT'),
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
        primary_area = coalesce(nullif(p_profile->>'primary_area', ''), primary_area),
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

grant execute on function public.superadmin_save_profile_with_roles(uuid, jsonb, text[]) to authenticated;

create or replace function public.superadmin_update_profile(p_profile_id uuid, p_profile jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_platform_superadmin() then
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
  where id = p_profile_id
  returning * into v_profile;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_profile.company_id, public.current_profile_id(), 'modificacion', 'profiles', v_profile.id, 'Usuario actualizado por propietario global');

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
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para gestionar roles';
  end if;

  select company_id into v_company_id from public.profiles where id = p_profile_id;
  if v_company_id is null then raise exception 'Usuario no encontrado'; end if;
  if exists (select 1 from unnest(p_role_names) requested(name) left join public.roles r on r.name = requested.name where r.id is null) then
    raise exception 'Alguno de los roles no existe';
  end if;

  delete from public.profile_roles where profile_id = p_profile_id;
  insert into public.profile_roles(profile_id, role_id)
  select p_profile_id, id from public.roles where name = any(p_role_names);

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, public.current_profile_id(), 'modificacion', 'profile_roles', p_profile_id, 'Roles actualizados por propietario global');
end;
$$;

grant execute on function public.superadmin_update_profile(uuid, jsonb) to authenticated;
grant execute on function public.superadmin_set_profile_roles(uuid, text[]) to authenticated;
