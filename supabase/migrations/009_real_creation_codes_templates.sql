-- DoorManager Pro - creacion real: codigos, permisos y plantillas compatibles

create or replace function public.dmp_normalize_text(value text)
returns text
language sql
immutable
as $$
  select lower(replace(replace(replace(replace(replace(coalesce(value, ''), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'));
$$;

create or replace function public.has_any_role(role_names text[])
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
      and p.primary_area = any(role_names)
  ) or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and r.name = any(role_names)
  );
$$;

create or replace function public.dmp_equipment_code_prefix(p_equipment_type_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select public.dmp_normalize_text(name) into v_name
  from public.equipment_types
  where id = p_equipment_type_id;

  if v_name like '%cuadro%' then return 'EQ-CUA'; end if;
  if v_name like '%barrera%' then return 'EQ-BAR'; end if;
  if v_name like '%rapida%' then return 'EQ-RAP'; end if;
  if v_name like '%enrollable%' then return 'EQ-ENR'; end if;
  if v_name like '%corredera%' then return 'EQ-COR'; end if;
  if v_name like '%batiente%' then return 'EQ-BAT'; end if;
  if v_name like '%abrigo%' then return 'EQ-ABR'; end if;
  if v_name like '%muelle%' then return 'EQ-MUE'; end if;
  if v_name like '%peatonal%' then return 'EQ-PEA'; end if;
  if v_name like '%cancela%' or v_name like '%porton%' then return 'EQ-CAN'; end if;
  return 'EQ-SEC';
end;
$$;

create or replace function public.next_dmp_code(
  p_company_id uuid,
  p_table_name text,
  p_prefix text,
  p_yearly boolean default false,
  p_width integer default 6
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_base text;
  v_sequence integer;
  v_start integer;
begin
  perform public.assert_member_of_current_company(p_company_id);

  if p_table_name <> all(array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes']) then
    raise exception 'Tabla no permitida para generar codigo: %', p_table_name;
  end if;
  if nullif(p_prefix, '') is null then
    raise exception 'Prefijo de codigo obligatorio';
  end if;

  v_base := case when p_yearly then p_prefix || '-' || v_year || '-' else p_prefix || '-' end;
  v_start := length(v_base) + 1;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':' || p_table_name || ':' || v_base));

  execute format(
    'select coalesce(max(substring(code from $2)::integer), 0) + 1
       from public.%I
      where company_id = $1
        and code like $3
        and substring(code from $2) ~ ''^[0-9]+$''',
    p_table_name
  ) into v_sequence using p_company_id, v_start, v_base || '%';

  return v_base || lpad(v_sequence::text, greatest(p_width, 1), '0');
end;
$$;

create or replace function public.assign_core_entity_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if new.code is distinct from old.code then
      raise exception 'El codigo no se puede modificar';
    end if;
    return new;
  end if;

  if nullif(new.code, '') is not null then
    return new;
  end if;

  if TG_TABLE_NAME = 'clients' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'CLI', false, 6);
  elsif TG_TABLE_NAME = 'sites' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'CEN', false, 6);
  elsif TG_TABLE_NAME = 'equipment' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, public.dmp_equipment_code_prefix(new.equipment_type_id), false, 6);
  elsif TG_TABLE_NAME = 'cases' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'EXP', true, 6);
  elsif TG_TABLE_NAME = 'work_orders' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'PAR', true, 6);
  elsif TG_TABLE_NAME = 'checks' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'CHK', true, 6);
  elsif TG_TABLE_NAME = 'deficiencies' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'DEF', true, 6);
  elsif TG_TABLE_NAME = 'alerts' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'AVI', true, 6);
  elsif TG_TABLE_NAME = 'materials' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'MAT', false, 6);
  elsif TG_TABLE_NAME = 'warehouses' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'ALM', false, 6);
  elsif TG_TABLE_NAME = 'opportunities' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'OPP', true, 6);
  elsif TG_TABLE_NAME = 'quotes' then
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'PRE', true, 6);
  end if;

  if nullif(new.code, '') is null then
    raise exception 'No se ha podido generar codigo para %', TG_TABLE_NAME;
  end if;

  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['clients','sites','equipment','cases','work_orders','checks','deficiencies','alerts','materials','warehouses','opportunities','quotes'] loop
    execute format('drop trigger if exists trg_%I_auto_code on public.%I', t, t);
    execute format('create trigger trg_%I_auto_code before insert or update of code on public.%I for each row execute function public.assign_core_entity_code()', t, t);
  end loop;
end $$;

create or replace function public.create_work_order(
  p_company_id uuid, p_client_id uuid, p_site_id uuid, p_title text, p_type text, p_priority text,
  p_origin text, p_created_by uuid, p_created_role text, p_description text default null, p_case_id uuid default null,
  p_main_equipment_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  perform public.assert_member_of_current_company(p_company_id);
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then
    raise exception 'No tienes permisos para crear partes';
  end if;
  if p_created_by <> public.current_profile_id() then
    raise exception 'El creador no coincide con el usuario autenticado';
  end if;
  if p_created_role not in ('SAT','Comercial','Gerencia') then
    raise exception 'Rol creador no autorizado';
  end if;
  if p_type not in ('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia') then
    raise exception 'Tipo de parte no valido: %', p_type;
  end if;
  if p_origin not in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema') then
    raise exception 'Origen no valido: %', p_origin;
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and company_id = p_company_id and deleted_at is null) then raise exception 'Cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = p_site_id and company_id = p_company_id and client_id = p_client_id and deleted_at is null) then raise exception 'Centro no valido'; end if;
  if p_main_equipment_id is not null and not exists (select 1 from public.equipment where id = p_main_equipment_id and company_id = p_company_id and client_id = p_client_id and site_id = p_site_id and deleted_at is null) then raise exception 'Equipo no valido'; end if;

  v_code := public.next_dmp_code(p_company_id, 'work_orders', 'PAR', true, 6);

  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, created_by, created_role, updated_by, current_responsible_id)
  values (p_company_id, v_code, p_case_id, p_client_id, p_site_id, p_main_equipment_id, p_title, p_description, p_type, p_priority, p_origin, p_created_by, p_created_role, p_created_by, p_created_by)
  returning id into v_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (p_company_id, v_id, null, 'Pendiente', p_created_by, 'Creacion de parte ' || v_code);

  return v_id;
end;
$$;

create or replace function public.unassign_work_order_profile(
  p_work_order_id uuid,
  p_profile_id uuid,
  p_changed_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para desasignar partes'; end if;

  update public.work_order_assignments
  set deleted_at = now(), status = 'Cancelado'
  where work_order_id = p_work_order_id
    and technician_id = p_profile_id
    and deleted_at is null;

  update public.work_orders
  set main_technician_id = case when main_technician_id = p_profile_id then null else main_technician_id end,
      current_responsible_id = case when current_responsible_id = p_profile_id then p_changed_by else current_responsible_id end,
      updated_by = p_changed_by
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  select v_company_id, id, status, status, p_changed_by, 'Desasignacion de perfil', true
  from public.work_orders where id = p_work_order_id;
end;
$$;

create or replace function public.assign_commercial_work_order(
  p_work_order_id uuid,
  p_commercial_id uuid,
  p_changed_by uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if p_changed_by <> public.current_profile_id() then raise exception 'Usuario no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'No tienes permisos para asignar comerciales'; end if;
  if not exists (select 1 from public.profiles where id = p_commercial_id and company_id = v_company_id and active = true and deleted_at is null and primary_area = 'Comercial') then
    raise exception 'El perfil no es comercial activo de la empresa';
  end if;

  update public.work_orders
  set current_responsible_id = p_commercial_id,
      updated_by = p_changed_by
  where id = p_work_order_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
  select v_company_id, id, status, status, p_changed_by, 'Asignacion comercial', true
  from public.work_orders where id = p_work_order_id;
end;
$$;

drop policy if exists clients_write_roles on public.clients;
create policy clients_write_roles on public.clients for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']));

drop policy if exists sites_write_roles on public.sites;
create policy sites_write_roles on public.sites for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']));

drop policy if exists equipment_write_roles on public.equipment;
create policy equipment_write_roles on public.equipment for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));

drop policy if exists work_orders_write_roles on public.work_orders;
create policy work_orders_write_roles on public.work_orders for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']));

drop policy if exists checks_write_roles on public.checks;
create policy checks_write_roles on public.checks for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Tecnico','Gerencia']));

drop policy if exists alerts_write_roles on public.alerts;
create policy alerts_write_roles on public.alerts for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico']));

create or replace function public.dmp_template_sections_for_type(p_type_name text)
returns text[]
language plpgsql
immutable
as $$
declare
  v_name text := public.dmp_normalize_text(p_type_name);
begin
  if v_name like '%cuadro%' then
    return array['Estado del cuadro','Alimentacion electrica','Protecciones','Bornes y cableado','Contactores/reles/variador','Maniobra y programacion','Entradas de seguridad','Pruebas de funcionamiento','Funcionamiento general'];
  elsif v_name like '%seccional%' then
    return array['Linea de muelles','Guias','Hoja','Puerta peatonal','Sistema electrico y seguridad','Funcionamiento general'];
  elsif v_name like '%rapida%' then
    return array['Lona','Guias','Motor','Cuadro electrico','Fotocelulas y seguridad','Funcionamiento general'];
  elsif v_name like '%enrollable%' then
    return array['Lamas','Eje y compensacion','Guias laterales','Motor','Cuadro electrico y seguridad','Funcionamiento general'];
  elsif v_name like '%barrera%' then
    return array['Mastil','Motorreductor','Muelle/equilibrado','Finales de carrera','Fotocelulas/lazo magnetico','Funcionamiento general'];
  elsif v_name like '%corredera%' then
    return array['Hoja','Guia/carril','Ruedas','Cremallera','Motor','Fotocelulas y seguridad','Funcionamiento general'];
  elsif v_name like '%batiente%' then
    return array['Hojas','Bisagras','Brazos/motores','Cerradura/tope','Fotocelulas y seguridad','Funcionamiento general'];
  elsif v_name like '%abrigo%' then
    return array['Lona/cortinas','Estructura','Brazos/articulaciones','Fijaciones','Estado de sellado','Funcionamiento general'];
  elsif v_name like '%muelle%' then
    return array['Plataforma','Una/labio','Bisagras','Grupo hidraulico','Cuadro electrico','Seguridad','Funcionamiento general'];
  elsif v_name like '%peatonal%' then
    return array['Hojas','Guias/carro','Motor','Sensores','Seguridad','Funcionamiento general'];
  elsif v_name like '%cancela%' or v_name like '%porton%' then
    return array['Hoja','Guias/bisagras','Motor','Finales de carrera','Seguridad','Funcionamiento general'];
  end if;
  return array['Estructura principal','Elementos moviles','Automatizacion y seguridad','Funcionamiento general'];
end;
$$;

do $$
declare
  c record;
  type_name text;
  type_names text[] := array[
    'Puerta seccional industrial',
    'Puerta rápida',
    'Puerta enrollable',
    'Barrera automática',
    'Puerta corredera',
    'Puerta batiente',
    'Muelle de carga',
    'Abrigo de muelle',
    'Puerta automática peatonal',
    'Cancela / portón',
    'Cuadro de maniobra'
  ];
begin
  for c in select id from public.companies loop
    foreach type_name in array type_names loop
      insert into public.equipment_types(company_id, name, description, active)
      select c.id, type_name, 'Tipo DMP para checks compatibles', true
      where not exists (
        select 1 from public.equipment_types
        where company_id = c.id and public.dmp_normalize_text(name) = public.dmp_normalize_text(type_name)
      );
    end loop;
  end loop;
end $$;

do $$
declare
  et record;
  v_template_id uuid;
  v_section_id uuid;
  v_titles text[];
  v_title text;
  v_pos integer;
begin
  for et in select id, company_id, name from public.equipment_types where active = true loop
    v_titles := public.dmp_template_sections_for_type(et.name);

    select id into v_template_id
    from public.check_templates
    where equipment_type_id = et.id
      and company_id is not distinct from et.company_id
      and active = true
    order by created_at
    limit 1;

    if v_template_id is null then
      insert into public.check_templates(company_id, equipment_type_id, name, version, active)
      values (et.company_id, et.id, 'Check ' || et.name, '1.0', true)
      returning id into v_template_id;
    else
      update public.check_templates
      set name = 'Check ' || et.name,
          version = coalesce(nullif(version, ''), '1.0'),
          active = true,
          updated_at = now()
      where id = v_template_id;
    end if;

    v_pos := 1;
    foreach v_title in array v_titles loop
      select id into v_section_id
      from public.check_template_sections
      where template_id = v_template_id and position = v_pos
      limit 1;

      if v_section_id is null then
        insert into public.check_template_sections(template_id, title, position)
        values (v_template_id, v_title, v_pos)
        returning id into v_section_id;
      else
        update public.check_template_sections set title = v_title where id = v_section_id;
      end if;

      insert into public.check_template_items(section_id, title, component, position, mandatory)
      values
        (v_section_id, 'Estado general', v_title, 1, true),
        (v_section_id, 'Fijaciones, desgaste y holguras', v_title, 2, true),
        (v_section_id, 'Seguridad y funcionamiento', v_title, 3, true)
      on conflict (section_id, position) do update
        set title = excluded.title,
            component = excluded.component,
            mandatory = excluded.mandatory;

      v_pos := v_pos + 1;
    end loop;
  end loop;
end $$;

grant execute on function public.dmp_normalize_text(text) to authenticated;
grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.dmp_equipment_code_prefix(uuid) to authenticated;
grant execute on function public.next_dmp_code(uuid, text, text, boolean, integer) to authenticated;
grant execute on function public.create_work_order(uuid, uuid, uuid, text, text, text, text, uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.unassign_work_order_profile(uuid, uuid, uuid) to authenticated;
grant execute on function public.assign_commercial_work_order(uuid, uuid, uuid) to authenticated;

create or replace view public.v_work_order_full_detail as
select wo.id, wo.company_id, wo.code, wo.title, wo.description, wo.type, wo.priority, wo.status, wo.origin,
       wo.scheduled_date, wo.scheduled_time, wo.diagnosis, wo.work_performed, wo.result,
       wo.main_technician_id, wo.current_responsible_id, wo.created_by, wo.created_at, wo.updated_at,
       ca.code as case_code, c.code as client_code, c.legal_name as client_name, s.code as site_code, s.name as site_name,
       e.code as equipment_code, et.name as equipment_type,
       tech.first_name || ' ' || tech.last_name as main_technician_name,
       creator.first_name || ' ' || creator.last_name as created_by_name,
       responsible.first_name || ' ' || responsible.last_name as responsible_name
from public.work_orders wo
left join public.cases ca on ca.id = wo.case_id
join public.clients c on c.id = wo.client_id
join public.sites s on s.id = wo.site_id
left join public.equipment e on e.id = wo.main_equipment_id
left join public.equipment_types et on et.id = e.equipment_type_id
left join public.profiles tech on tech.id = wo.main_technician_id
left join public.profiles creator on creator.id = wo.created_by
left join public.profiles responsible on responsible.id = wo.current_responsible_id
where wo.deleted_at is null;
