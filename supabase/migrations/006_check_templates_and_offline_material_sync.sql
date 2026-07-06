-- DoorManager Pro - plantillas minimas por tipo y sincronizacion de materiales tecnicos

create or replace function public.dmp_template_sections_for_type(p_type_name text)
returns text[]
language plpgsql
immutable
as $$
declare
  v_name text := lower(replace(replace(replace(replace(replace(coalesce(p_type_name, ''), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'));
begin
  if v_name like '%seccional%' then
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
  elsif v_name like '%muelle%' then
    return array['Plataforma','Una/labio','Bisagras','Grupo hidraulico','Cuadro electrico','Seguridad','Funcionamiento general'];
  elsif v_name like '%abrigo%' then
    return array['Lona/cortinas','Estructura','Brazos/articulaciones','Fijaciones','Estado de sellado','Funcionamiento general'];
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
    'Puerta rapida',
    'Puerta enrollable',
    'Barrera automatica',
    'Puerta corredera',
    'Puerta batiente',
    'Muelle de carga',
    'Abrigo de muelle',
    'Puerta peatonal automatica',
    'Cancela o porton'
  ];
begin
  for c in select id from public.companies loop
    foreach type_name in array type_names loop
      insert into public.equipment_types(company_id, name, description, active)
      select c.id, type_name, 'Tipo minimo DMP para checks compatibles', true
      where not exists (
        select 1 from public.equipment_types where company_id = c.id and lower(name) = lower(type_name)
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

create or replace function public.record_work_order_material_usage(
  p_company_id uuid,
  p_work_order_id uuid,
  p_description text,
  p_quantity numeric default 1,
  p_created_by uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material_id uuid;
  v_usage_id uuid;
  v_description text := trim(coalesce(p_description, ''));
begin
  perform public.assert_member_of_current_company(p_company_id);

  if v_description = '' then
    raise exception 'Material obligatorio';
  end if;

  select id into v_material_id
  from public.materials
  where company_id = p_company_id
    and lower(description) = lower(v_description)
    and deleted_at is null
  limit 1;

  if v_material_id is null then
    insert into public.materials(company_id, code, description, unit, active)
    values (p_company_id, public.next_dmp_code(p_company_id, 'materials', 'MAT', false, 6), v_description, 'ud', true)
    returning id into v_material_id;
  end if;

  insert into public.work_order_materials(company_id, work_order_id, material_id, used_quantity, notes)
  values (p_company_id, p_work_order_id, v_material_id, greatest(coalesce(p_quantity, 1), 0), 'Sincronizado desde modo tecnico offline')
  returning id into v_usage_id;

  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by)
  values (p_company_id, p_work_order_id, 'Material usado: ' || v_description || ' · Cantidad: ' || greatest(coalesce(p_quantity, 1), 0)::text, 'Tecnica', p_created_by);

  return v_usage_id;
end;
$$;

grant execute on function public.dmp_template_sections_for_type(text) to authenticated;
grant execute on function public.record_work_order_material_usage(uuid, uuid, text, numeric, uuid) to authenticated;
