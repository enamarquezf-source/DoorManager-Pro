-- DoorManager Pro
-- 051_consolidate_operating_company.sql
--
-- Consolida de forma segura DoorManager Pro en una única empresa operadora.
--
-- Empresa operadora:
--   00000000-0000-0000-0000-000000000001
--
-- Empresa secundaria histórica:
--   fd3528fa-7603-4bb6-9e45-5dcb1f80c664
--
-- Esta migración:
--   - NO borra empresas.
--   - NO borra perfiles.
--   - NO borra históricos.
--   - NO reasigna datos operativos de forma masiva.
--   - Corrige únicamente relaciones demostrablemente inconsistentes.
--   - Conserva el mismo perfil y auth_user_id del Superadmin.
--   - Desactiva la empresa secundaria únicamente cuando la auditoría
--     confirma que ya no quedan datos asociados.
--   - Se ejecuta de forma transaccional.

begin;

do $$
declare
  --------------------------------------------------------------------
  -- IDENTIFICADORES CONFIRMADOS EN PRODUCCIÓN
  --------------------------------------------------------------------

  v_target_company_id constant uuid :=
    '00000000-0000-0000-0000-000000000001'::uuid;

  v_secondary_company_id constant uuid :=
    'fd3528fa-7603-4bb6-9e45-5dcb1f80c664'::uuid;

  v_superadmin_profile_id constant uuid :=
    '3e8504b5-79da-429d-a985-0269425d2bc7'::uuid;

  v_superadmin_auth_user_id constant uuid :=
    '1a7b729f-b01e-4161-b9c1-8006d6eb6852'::uuid;

  v_superadmin_email constant text :=
    'fonsy69@gmail.com';

  v_known_note_id constant uuid :=
    '3218c87f-ff61-4b2f-8467-acdf4cb2f9d6'::uuid;

  v_known_work_order_id constant uuid :=
    '0b290352-8232-4b2e-b1a6-5472e5ed3cf8'::uuid;

  --------------------------------------------------------------------
  -- VARIABLES
  --------------------------------------------------------------------

  v_profile public.profiles;
  v_note public.work_order_notes;

  v_count integer;
  v_table text;
  v_residual_tables text := '';

begin

  --------------------------------------------------------------------
  -- 1. VALIDAR Y BLOQUEAR EMPRESA OPERADORA
  --------------------------------------------------------------------

  perform 1
  from public.companies
  where id = v_target_company_id
    and active = true
    and deleted_at is null
  for update;

  if not found then
    raise exception
      'La empresa operadora destino no existe, no esta activa o esta archivada: %',
      v_target_company_id;
  end if;


  --------------------------------------------------------------------
  -- 2. VALIDAR Y BLOQUEAR EMPRESA SECUNDARIA
  --------------------------------------------------------------------

  perform 1
  from public.companies
  where id = v_secondary_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception
      'La empresa secundaria esperada no existe o esta archivada: %',
      v_secondary_company_id;
  end if;


  --------------------------------------------------------------------
  -- 3. VALIDAR PERFIL SUPERADMIN
  --------------------------------------------------------------------

  select *
  into v_profile
  from public.profiles
  where id = v_superadmin_profile_id
  for update;

  if v_profile.id is null then
    raise exception
      'No existe el perfil Superadmin esperado: %',
      v_superadmin_profile_id;
  end if;


  if v_profile.auth_user_id is distinct from v_superadmin_auth_user_id then
    raise exception
      'El auth_user_id del perfil Superadmin no coincide con el esperado';
  end if;


  if lower(v_profile.email) is distinct from lower(v_superadmin_email) then
    raise exception
      'El email del perfil Superadmin no coincide con el esperado';
  end if;


  if v_profile.active is not true
     or v_profile.deleted_at is not null then
    raise exception
      'El perfil Superadmin esperado no esta activo';
  end if;


  if not (
    lower(v_profile.primary_area) = 'superadmin'
    or exists (
      select 1
      from public.profile_roles pr
      join public.roles r
        on r.id = pr.role_id
      where pr.profile_id = v_superadmin_profile_id
        and lower(r.name) = 'superadmin'
    )
  ) then
    raise exception
      'El perfil esperado no conserva permisos Superadmin';
  end if;


  --------------------------------------------------------------------
  -- Permitimos dos estados:
  --
  -- A) estado actual esperado:
  --    Superadmin todavía en empresa secundaria.
  --
  -- B) estado parcialmente corregido:
  --    Superadmin ya pertenece a empresa principal.
  --------------------------------------------------------------------

  if v_profile.company_id not in (
    v_secondary_company_id,
    v_target_company_id
  ) then
    raise exception
      'El perfil Superadmin pertenece a una empresa inesperada: %',
      v_profile.company_id;
  end if;


  --------------------------------------------------------------------
  -- 4. COMPROBAR QUE NO HAY OTRO SUPERADMIN CON EL MISMO EMAIL
  --    EN LA EMPRESA DESTINO
  --------------------------------------------------------------------

  if exists (
    select 1
    from public.profiles p
    where p.company_id = v_target_company_id
      and lower(p.email) = lower(v_superadmin_email)
      and p.id <> v_superadmin_profile_id
      and p.deleted_at is null
  ) then
    raise exception
      'Ya existe otro perfil con el email del Superadmin en la empresa operadora destino';
  end if;


  --------------------------------------------------------------------
  -- 5. RECONCILIAR WORK_ORDER_NOTE CONFIRMADA
  --------------------------------------------------------------------
  --
  -- Datos reales confirmados:
  --
  -- Nota:
  -- 3218c87f-ff61-4b2f-8467-acdf4cb2f9d6
  --
  -- Parte:
  -- 0b290352-8232-4b2e-b1a6-5472e5ed3cf8
  --
  -- El parte pertenece a la empresa principal.
  --
  -- Por tanto la nota debe heredar el company_id del parte.
  --
  -- NO se modifica:
  --   id
  --   work_order_id
  --   note
  --   visibility
  --   created_by
  --   created_at
  --   local_change_id
  --------------------------------------------------------------------

  select *
  into v_note
  from public.work_order_notes
  where id = v_known_note_id
  for update;


  if v_note.id is not null then

    if v_note.work_order_id is distinct from v_known_work_order_id then
      raise exception
        'La nota conocida apunta a un parte diferente del esperado';
    end if;


    if not exists (
      select 1
      from public.work_orders wo
      where wo.id = v_note.work_order_id
        and wo.company_id = v_target_company_id
    ) then
      raise exception
        'El parte relacionado con la nota no pertenece a la empresa operadora esperada';
    end if;


    if v_note.company_id = v_secondary_company_id then

      update public.work_order_notes won
      set company_id = wo.company_id
      from public.work_orders wo
      where won.id = v_note.id
        and won.work_order_id = wo.id
        and won.company_id = v_secondary_company_id
        and wo.company_id = v_target_company_id;

      if not found then
        raise exception
          'No se pudo reconciliar el company_id de la nota tecnica';
      end if;


    elsif v_note.company_id <> v_target_company_id then

      raise exception
        'La nota tecnica pertenece a una empresa inesperada: %',
        v_note.company_id;

    end if;

  end if;


  --------------------------------------------------------------------
  -- 6. COMPROBAR QUE NO QUEDAN OTRAS WORK_ORDER_NOTES SECUNDARIAS
  --------------------------------------------------------------------

  select count(*)
  into v_count
  from public.work_order_notes
  where company_id = v_secondary_company_id;

  if v_count <> 0 then
    raise exception
      'Quedan % work_order_notes de la empresa secundaria sin reconciliar',
      v_count;
  end if;


  --------------------------------------------------------------------
  -- 7. RECONCILIAR ACTIVITY_LOG
  --------------------------------------------------------------------
  --
  -- Producción ha confirmado tres registros con:
  --
  -- actor_profile_id =
  -- 3e8504b5-79da-429d-a985-0269425d2bc7
  --
  -- entity_type = profiles
  --
  -- entity_id =
  -- bbb63642-3177-41e2-87af-7125993528e5
  --
  -- Ese perfil afectado pertenece a la empresa principal.
  --
  -- Estos eventos describen modificaciones realizadas por el antiguo
  -- Superadmin global sobre un perfil de la empresa principal.
  --
  -- Por tanto el company_id correcto del evento se obtiene del perfil
  -- afectado, NO de la antigua empresa del actor.
  --
  -- No modificamos:
  --   id
  --   actor_profile_id
  --   action
  --   entity_type
  --   entity_id
  --   description
  --   created_at
  --   metadata
  --------------------------------------------------------------------

  update public.activity_log al
  set company_id = p.company_id
  from public.profiles p
  where al.company_id = v_secondary_company_id
    and al.entity_type = 'profiles'
    and al.entity_id = p.id
    and p.company_id = v_target_company_id;


  --------------------------------------------------------------------
  -- No asumimos que cualquier activity_log secundario sea movible.
  -- Si queda alguno después de la reconciliación por entidad padre,
  -- detenemos toda la migración.
  --------------------------------------------------------------------

  select count(*)
  into v_count
  from public.activity_log
  where company_id = v_secondary_company_id;

  if v_count <> 0 then
    raise exception
      'Quedan % eventos de activity_log de la empresa secundaria que no se pueden reconciliar automaticamente',
      v_count;
  end if;


  --------------------------------------------------------------------
  -- 8. RECONCILIAR PROFILE_ROLES SI LA TABLA TIENE COMPANY_ID
  --------------------------------------------------------------------
  --
  -- No asumimos que profile_roles tenga company_id.
  -- Lo comprobamos dinámicamente.
  --------------------------------------------------------------------

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile_roles'
      and column_name = 'company_id'
  ) then

    execute '
      update public.profile_roles
      set company_id = $1
      where profile_id = $2
        and company_id = $3
    '
    using
      v_target_company_id,
      v_superadmin_profile_id,
      v_secondary_company_id;

  end if;


  --------------------------------------------------------------------
  -- 9. AUDITORÍA GLOBAL DINÁMICA
  --------------------------------------------------------------------
  --
  -- Revisamos TODAS las tablas BASE TABLE de public que tengan
  -- company_id.
  --
  -- Excluimos únicamente las entidades que estamos tratando de forma
  -- explícita:
  --
  -- companies
  -- profiles
  -- work_order_notes
  -- activity_log
  -- profile_roles
  --
  -- Si aparece cualquier otro registro secundario:
  -- RAISE EXCEPTION + ROLLBACK.
  --------------------------------------------------------------------

  v_residual_tables := '';

  for v_table in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'company_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'companies',
        'profiles',
        'work_order_notes',
        'activity_log',
        'profile_roles'
      )
    order by c.table_name
  loop

    execute format(
      'select count(*) from public.%I where company_id = $1',
      v_table
    )
    into v_count
    using v_secondary_company_id;


    if v_count > 0 then

      v_residual_tables :=
        v_residual_tables
        || case
             when v_residual_tables = '' then ''
             else ', '
           end
        || v_table
        || ' (' || v_count || ')';

    end if;

  end loop;


  if v_residual_tables <> '' then
    raise exception
      'La empresa secundaria conserva datos no reconciliados: %',
      v_residual_tables;
  end if;


  --------------------------------------------------------------------
  -- 10. COMPROBAR OTROS PERFILES EN EMPRESA SECUNDARIA
  --------------------------------------------------------------------

  select count(*)
  into v_count
  from public.profiles
  where company_id = v_secondary_company_id
    and id <> v_superadmin_profile_id;

  if v_count <> 0 then
    raise exception
      'La empresa secundaria contiene otros perfiles distintos del Superadmin esperado: %',
      v_count;
  end if;


  --------------------------------------------------------------------
  -- 11. MOVER EL MISMO PERFIL SUPERADMIN
  --------------------------------------------------------------------
  --
  -- Se conserva:
  --   id
  --   auth_user_id
  --   first_name
  --   last_name
  --   email
  --   phone
  --   active
  --   primary_area
  --   hired_at
  --   created_at
  --
  -- Solo cambia:
  --   company_id
  --   updated_at
  --------------------------------------------------------------------

  if v_profile.company_id = v_secondary_company_id then

    update public.profiles
    set company_id = v_target_company_id,
        updated_at = now()
    where id = v_superadmin_profile_id
      and auth_user_id = v_superadmin_auth_user_id
      and company_id = v_secondary_company_id;

    if not found then
      raise exception
        'No se pudo mover el perfil Superadmin esperado a la empresa operadora';
    end if;

  end if;


  --------------------------------------------------------------------
  -- 12. COMPROBAR QUE YA NO QUEDAN PERFILES SECUNDARIOS
  --------------------------------------------------------------------

  select count(*)
  into v_count
  from public.profiles
  where company_id = v_secondary_company_id;

  if v_count <> 0 then
    raise exception
      'Todavia quedan % perfiles asociados a la empresa secundaria',
      v_count;
  end if;


  --------------------------------------------------------------------
  -- 13. DESACTIVAR EMPRESA SECUNDARIA
  --------------------------------------------------------------------
  --
  -- NO DELETE.
  -- NO deleted_at.
  -- Se conserva como histórico.
  --------------------------------------------------------------------

  update public.companies
  set active = false,
      deleted_at = null,
      updated_at = now()
  where id = v_secondary_company_id;

  if not found then
    raise exception
      'No se pudo inactivar la empresa secundaria';
  end if;


  --------------------------------------------------------------------
  -- 14. VALIDAR EMPRESA OPERADORA RESULTANTE
  --------------------------------------------------------------------

  if public.dmp_operating_company_id()
       is distinct from v_target_company_id then

    raise exception
      'La empresa operadora resultante no es la esperada';

  end if;


  --------------------------------------------------------------------
  -- 15. VALIDAR SUPERADMIN RESULTANTE
  --------------------------------------------------------------------

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_superadmin_profile_id
      and p.auth_user_id = v_superadmin_auth_user_id
      and p.company_id = v_target_company_id
      and lower(p.email) = lower(v_superadmin_email)
      and p.active = true
      and p.deleted_at is null
      and (
        lower(p.primary_area) = 'superadmin'
        or exists (
          select 1
          from public.profile_roles pr
          join public.roles r
            on r.id = pr.role_id
          where pr.profile_id = p.id
            and lower(r.name) = 'superadmin'
        )
      )
  ) then

    raise exception
      'El perfil Superadmin no quedo asociado correctamente a la empresa operadora';

  end if;


  --------------------------------------------------------------------
  -- 16. VALIDAR NOTA TÉCNICA RESULTANTE
  --------------------------------------------------------------------

  if exists (
    select 1
    from public.work_order_notes won
    where won.id = v_known_note_id
      and (
        won.company_id <> v_target_company_id
        or won.work_order_id <> v_known_work_order_id
      )
  ) then

    raise exception
      'La nota tecnica conocida no quedo correctamente reconciliada';

  end if;


  --------------------------------------------------------------------
  -- 17. VALIDAR EMPRESA SECUNDARIA INACTIVA
  --------------------------------------------------------------------

  if exists (
    select 1
    from public.companies
    where id = v_secondary_company_id
      and active = true
  ) then

    raise exception
      'La empresa secundaria continua activa';

  end if;


  --------------------------------------------------------------------
  -- 18. AUDITORÍA GLOBAL FINAL
  --------------------------------------------------------------------
  --
  -- Después de la consolidación NO debe quedar ningún registro en
  -- ninguna tabla con company_id secundario, excepto la propia fila
  -- histórica de companies.
  --------------------------------------------------------------------

  v_residual_tables := '';

  for v_table in
    select distinct c.table_name
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

    execute format(
      'select count(*) from public.%I where company_id = $1',
      v_table
    )
    into v_count
    using v_secondary_company_id;


    if v_count > 0 then

      v_residual_tables :=
        v_residual_tables
        || case
             when v_residual_tables = '' then ''
             else ', '
           end
        || v_table
        || ' (' || v_count || ')';

    end if;

  end loop;


  if v_residual_tables <> '' then
    raise exception
      'Despues de consolidar aun quedan datos vinculados a la empresa secundaria: %',
      v_residual_tables;
  end if;


  --------------------------------------------------------------------
  -- 19. VALIDACIÓN FINAL DE EMPRESAS ACTIVAS
  --------------------------------------------------------------------

  select count(*)
  into v_count
  from public.companies
  where active = true
    and deleted_at is null;

  if v_count <> 1 then
    raise exception
      'Despues de consolidar debe existir exactamente una empresa activa; encontradas: %',
      v_count;
  end if;


  if not exists (
    select 1
    from public.companies
    where id = v_target_company_id
      and active = true
      and deleted_at is null
  ) then

    raise exception
      'La unica empresa activa resultante no es la empresa operadora esperada';

  end if;

end $$;

commit;
