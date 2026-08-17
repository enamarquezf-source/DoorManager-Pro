-- DoorManager Pro - consolida la empresa operadora (definitiva).
-- Audita de forma dinamica TODAS las tablas base public con company_id via information_schema.columns.
-- Corrige la unica work_order_note de la empresa secundaria a traves de su parte padre (work_orders).
-- Mueve el perfil superadmin a la empresa operadora y deja la empresa secundaria inactiva como historico.
-- No elimina datos, no reasigna clientes/centros/equipos/presupuestos/partes/materiales
-- y mantiene la RLS activa.

begin;

do $$
declare
  v_target_company_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_secondary_company_id constant uuid := 'fd3528fa-7603-4bb6-9e45-5dcb1f80c664'::uuid;
  v_superadmin_profile_id constant uuid := '3e8504b5-79da-429d-a985-0269425d2bc7'::uuid;
  v_superadmin_auth_user_id constant uuid := '1a7b729f-b01e-4161-b9c1-8006d6eb6852'::uuid;
  v_superadmin_email constant text := 'fonsy69@gmail.com';
  v_profile public.profiles;
  v_count integer;
  v_table text;
begin
  -- ============================================================
  -- PRECONDICIONES (antes de cualquier update)
  -- ============================================================

  perform 1
  from public.companies
  where id = v_target_company_id
    and active = true
    and deleted_at is null
  for update;
  if not found then
    raise exception 'La empresa operadora destino no existe, no esta activa o esta archivada: %', v_target_company_id;
  end if;

  perform 1
  from public.companies
  where id = v_secondary_company_id
    and active = true
    and deleted_at is null
  for update;
  if not found then
    raise exception 'La empresa secundaria esperada no existe, no esta activa o esta archivada: %', v_secondary_company_id;
  end if;

  select count(*) into v_count
  from public.profiles
  where id = v_superadmin_profile_id;
  if v_count <> 1 then
    raise exception 'No existe exactamente el perfil superadmin esperado: %', v_superadmin_profile_id;
  end if;

  select * into v_profile
  from public.profiles
  where id = v_superadmin_profile_id
  for update;

  if v_profile.company_id is distinct from v_secondary_company_id then
    raise exception 'El perfil superadmin esperado no pertenece a la empresa secundaria esperada';
  end if;
  if v_profile.auth_user_id is distinct from v_superadmin_auth_user_id then
    raise exception 'El auth_user_id del perfil superadmin no coincide con el esperado';
  end if;
  if lower(v_profile.email) is distinct from v_superadmin_email then
    raise exception 'El email del perfil superadmin no coincide con el esperado';
  end if;
  if v_profile.active is not true or v_profile.deleted_at is not null then
    raise exception 'El perfil superadmin esperado no esta activo';
  end if;
  if not (
    v_profile.primary_area = 'superadmin'
    or exists (
      select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
      where pr.profile_id = v_superadmin_profile_id
        and r.name = 'superadmin'
    )
  ) then
    raise exception 'El perfil esperado no conserva permisos superadmin';
  end if;

  select count(*) into v_count
  from public.profiles
  where company_id = v_secondary_company_id;
  if v_count <> 1 then
    raise exception 'La empresa secundaria debe contener solo el perfil superadmin esperado; perfiles encontrados: %', v_count;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.company_id = v_target_company_id
      and lower(p.email) = v_superadmin_email
      and p.id <> v_superadmin_profile_id
  ) then
    raise exception 'Ya existe otro perfil con el email superadmin en la empresa operadora destino';
  end if;

  -- ============================================================
  -- AUDITORIA 1: todas las tablas base public con company_id,
  -- excepto profiles y work_order_notes (gestionadas abajo),
  -- deben estar vacias en la empresa secundaria.
  -- ============================================================

  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'company_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('profiles', 'work_order_notes')
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where company_id = $1', v_table)
      into v_count
      using v_secondary_company_id;
    if v_count <> 0 then
      raise exception 'La empresa secundaria contiene datos no reconciliables en %. No se reasigna automaticamente.', v_table;
    end if;
  end loop;

  -- ============================================================
  -- AUDITORIA 2: work_order_notes de la empresa secundaria.
  -- Se corrigen SOLO con relacion inequivoca al parte padre:
  -- work_order_notes.work_order_id -> work_orders.id
  -- y work_orders.company_id = empresa operadora destino.
  -- ============================================================

  if exists (
    select 1
    from public.work_order_notes n
    where n.company_id = v_secondary_company_id
      and not exists (
        select 1
        from public.work_orders w
        where w.id = n.work_order_id
          and w.company_id = v_target_company_id
      )
  ) then
    raise exception 'Existen notas de la empresa secundaria cuyo parte padre no pertenece a la empresa operadora destino';
  end if;

  if exists (
    select 1
    from public.work_order_notes n
    join public.work_orders w on w.id = n.work_order_id
    where n.company_id = v_secondary_company_id
      and n.local_change_id is not null
      and w.company_id = v_target_company_id
      and exists (
        select 1
        from public.work_order_notes m
        where m.company_id = v_target_company_id
          and m.local_change_id = n.local_change_id
          and m.id <> n.id
      )
  ) then
    raise exception 'Conflicto de local_change_id al corregir notas de la empresa secundaria';
  end if;

  update public.work_order_notes n
  set company_id = w.company_id
  from public.work_orders w
  where n.company_id = v_secondary_company_id
    and w.id = n.work_order_id
    and w.company_id = v_target_company_id;

  select count(*) into v_count
  from public.work_order_notes
  where company_id = v_secondary_company_id;
  if v_count <> 0 then
    raise exception 'No se pudieron corregir todas las notas de la empresa secundaria; restantes: %', v_count;
  end if;

  -- ============================================================
  -- PERFIL SUPERADMIN: mover unicamente company_id.
  -- ============================================================

  update public.profiles
  set company_id = v_target_company_id
  where id = v_superadmin_profile_id
    and auth_user_id = v_superadmin_auth_user_id
    and company_id = v_secondary_company_id;

  if not found then
    raise exception 'No se pudo mover el perfil superadmin esperado a la empresa operadora';
  end if;

  -- ============================================================
  -- EMPRESA SECUNDARIA: inactivar como historico (sin DELETE).
  -- ============================================================

  update public.companies
  set active = false,
      updated_at = now()
  where id = v_secondary_company_id;

  if not found then
    raise exception 'No se pudo inactivar la empresa secundaria';
  end if;

  -- ============================================================
  -- VERIFICACIONES FINALES
  -- ============================================================

  if public.dmp_operating_company_id() is distinct from v_target_company_id then
    raise exception 'La empresa operadora resultante no es la esperada';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = v_target_company_id
      and c.active = true
      and c.deleted_at is null
  ) then
    raise exception 'La empresa operadora destino no permanece activa';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = v_secondary_company_id
      and c.active = false
      and c.deleted_at is null
  ) then
    raise exception 'La empresa secundaria no quedo inactiva';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_superadmin_profile_id
      and p.auth_user_id = v_superadmin_auth_user_id
      and p.company_id = v_target_company_id
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
  ) then
    raise exception 'El perfil superadmin no quedo asociado correctamente a la empresa operadora';
  end if;

  -- AUDITORIA 3: ninguna fila con company_id secundaria en ninguna tabla auditada.
  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'company_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'companies'
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where company_id = $1', v_table)
      into v_count
      using v_secondary_company_id;
    if v_count <> 0 then
      raise exception 'Aun existen datos con company_id secundaria en %', v_table;
    end if;
  end loop;
end $$;

commit;