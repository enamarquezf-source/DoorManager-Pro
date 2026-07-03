-- DoorManager Pro - codigos automaticos transaccionales para entidades principales

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
  v_regex text;
  v_base text;
  v_sequence integer;
begin
  perform public.assert_member_of_current_company(p_company_id);
  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':' || p_table_name || ':' || p_prefix || ':' || case when p_yearly then v_year else 'all' end));

  v_base := case when p_yearly then p_prefix || '-' || v_year || '-' else p_prefix || '-' end;
  v_regex := '^' || v_base || '[0-9]+$';

  execute format(
    'select coalesce(max(nullif(regexp_replace(code, %L, ''''), '''')::integer), 0) + 1 from public.%I where company_id = $1 and code ~ %L',
    '^' || v_base,
    p_table_name,
    v_regex
  ) into v_sequence using p_company_id;

  return v_base || lpad(v_sequence::text, p_width, '0');
end;
$$;

create or replace function public.assign_core_entity_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
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
    select case
      when lower(coalesce(name, '')) like '%barrera%' then 'EQ-BAR'
      when lower(coalesce(name, '')) like '%rapida%' or lower(coalesce(name, '')) like '%rápida%' then 'EQ-RAP'
      else 'EQ-SEC'
    end into v_prefix
    from public.equipment_types
    where id = new.equipment_type_id;
    new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, coalesce(v_prefix, 'EQ-SEC'), false, 6);
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
  foreach t in array array['clients','sites','equipment','work_orders','checks','deficiencies','alerts','materials','opportunities','quotes'] loop
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
begin
  perform public.assert_member_of_current_company(p_company_id);

  if p_type not in ('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia') then
    raise exception 'Tipo de parte no valido: %', p_type;
  end if;
  if p_origin not in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema') then
    raise exception 'Origen no valido: %', p_origin;
  end if;

  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, created_by, created_role, updated_by, current_responsible_id)
  values (p_company_id, null, p_case_id, p_client_id, p_site_id, p_main_equipment_id, p_title, p_description, p_type, p_priority, p_origin, p_created_by, p_created_role, p_created_by, p_created_by)
  returning id into v_id;

  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (p_company_id, v_id, null, 'Pendiente', p_created_by, 'Creacion de parte');

  return v_id;
end;
$$;

grant execute on function public.next_dmp_code(uuid, text, text, boolean, integer) to authenticated;
grant execute on function public.create_work_order(uuid, uuid, uuid, text, text, text, text, uuid, text, text, uuid, uuid) to authenticated;
