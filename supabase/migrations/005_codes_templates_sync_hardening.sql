-- DoorManager Pro - endurece codigos automaticos y plantillas por tipo de equipo

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
  select lower(replace(replace(replace(replace(replace(coalesce(name, ''), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u')) into v_name
  from public.equipment_types
  where id = p_equipment_type_id;

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

  if p_type not in ('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia') then
    raise exception 'Tipo de parte no valido: %', p_type;
  end if;
  if p_origin not in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema') then
    raise exception 'Origen no valido: %', p_origin;
  end if;

  v_code := public.next_dmp_code(p_company_id, 'work_orders', 'PAR', true, 6);

  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, created_by, created_role, updated_by, current_responsible_id)
  values (p_company_id, v_code, p_case_id, p_client_id, p_site_id, p_main_equipment_id, p_title, p_description, p_type, p_priority, p_origin, p_created_by, p_created_role, p_created_by, p_created_by)
  returning id into v_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (p_company_id, v_id, null, 'Pendiente', p_created_by, 'Creacion de parte ' || v_code);

  return v_id;
end;
$$;

do $$
declare
  et record;
  v_template_id uuid;
  v_section_id uuid;
  v_template_name text;
  v_titles text[];
  v_title text;
  v_pos integer;
begin
  for et in select id, company_id, name from public.equipment_types where active = true loop
    v_template_name := 'Check ' || et.name;
    select id into v_template_id
    from public.check_templates
    where equipment_type_id = et.id
      and name = v_template_name
      and version = '1.0'
      and company_id is not distinct from et.company_id
    limit 1;

    if v_template_id is null then
      insert into public.check_templates(company_id, equipment_type_id, name, version, active)
      values (et.company_id, et.id, v_template_name, '1.0', true)
      returning id into v_template_id;
    end if;

    if lower(replace(replace(replace(replace(replace(et.name, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u')) like '%seccional%' then
      v_titles := array['Linea de muelles','Guias','Hoja','Puerta peatonal','Sistema electrico y seguridad','Funcionamiento general'];
    elsif lower(replace(replace(replace(replace(replace(et.name, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u')) like '%rapida%' then
      v_titles := array['Lona','Guias laterales','Motor y cuadro','Seguridades','Funcionamiento general'];
    elsif lower(replace(replace(replace(replace(replace(et.name, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u')) like '%barrera%' then
      v_titles := array['Mastil','Motorreductor','Cuadro de maniobra','Seguridades','Funcionamiento general'];
    elsif lower(replace(replace(replace(replace(replace(et.name, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u')) like '%muelle%' then
      v_titles := array['Plataforma','Bisagras y cilindros','Grupo hidraulico','Labio y topes','Funcionamiento general'];
    else
      v_titles := array['Estructura principal','Elementos moviles','Automatizacion y seguridad','Accesorios','Funcionamiento general'];
    end if;

    v_pos := 1;
    foreach v_title in array v_titles loop
      select id into v_section_id from public.check_template_sections where template_id = v_template_id and position = v_pos limit 1;
      if v_section_id is null then
        insert into public.check_template_sections(template_id, title, position)
        values (v_template_id, v_title, v_pos)
        returning id into v_section_id;
      end if;

      if not exists (select 1 from public.check_template_items where section_id = v_section_id) then
        insert into public.check_template_items(section_id, title, component, position, mandatory)
        values
          (v_section_id, 'Estado general', v_title, 1, true),
          (v_section_id, 'Fijaciones y desgaste', v_title, 2, true),
          (v_section_id, 'Seguridad y funcionamiento', v_title, 3, true);
      end if;
      v_pos := v_pos + 1;
    end loop;
  end loop;
end $$;

grant execute on function public.dmp_equipment_code_prefix(uuid) to authenticated;
