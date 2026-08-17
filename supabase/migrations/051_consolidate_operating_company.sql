-- DoorManager Pro - consolida la empresa operadora tras la auditoria real de produccion.
-- Conserva el perfil superadmin existente y deja la empresa secundaria inactiva como historico.

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
  v_company_tables text[] := array[
    'clients',
    'client_contacts',
    'access_requirements',
    'sites',
    'site_contacts',
    'equipment_types',
    'equipment',
    'equipment_components',
    'equipment_status_history',
    'files',
    'equipment_photos',
    'cases',
    'case_events',
    'case_links',
    'case_documents',
    'work_orders',
    'work_order_equipment',
    'work_order_assignments',
    'work_order_status_history',
    'work_order_notes',
    'work_order_photos',
    'work_order_signatures',
    'work_order_time_entries',
    'work_order_cost_entries',
    'check_templates',
    'checks',
    'check_section_results',
    'check_item_results',
    'check_photos',
    'deficiencies',
    'corrective_actions',
    'alerts',
    'alert_recipients',
    'documents',
    'document_links',
    'suppliers',
    'materials',
    'warehouses',
    'warehouse_stock',
    'stock_movements',
    'material_stock_movements',
    'material_requests',
    'work_order_materials',
    'opportunities',
    'quotes',
    'quote_lines',
    'technician_hour_rates',
    'storage_cleanup_queue',
    'activity_log',
    'audit_log'
  ];
begin
  perform 1 from public.companies where id = v_target_company_id and active = true and deleted_at is null for update;
  if not found then
    raise exception 'La empresa operadora destino no existe, no esta activa o esta archivada: %', v_target_company_id;
  end if;

  perform 1 from public.companies where id = v_secondary_company_id and active = true and deleted_at is null for update;
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

  foreach v_table in array v_company_tables loop
    execute format('select count(*) from public.%I where company_id = $1', v_table)
      into v_count
      using v_secondary_company_id;
    if v_count <> 0 then
      raise exception 'La empresa secundaria contiene datos en %. No se consolida automaticamente.', v_table;
    end if;
  end loop;

  update public.profiles
  set company_id = v_target_company_id
  where id = v_superadmin_profile_id
    and auth_user_id = v_superadmin_auth_user_id
    and company_id = v_secondary_company_id;

  if not found then
    raise exception 'No se pudo mover el perfil superadmin esperado a la empresa operadora';
  end if;

  update public.companies
  set active = false,
      deleted_at = null
  where id = v_secondary_company_id;

  if not found then
    raise exception 'No se pudo inactivar la empresa secundaria';
  end if;

  if public.dmp_operating_company_id() is distinct from v_target_company_id then
    raise exception 'La empresa operadora resultante no es la esperada';
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
end $$;

commit;
