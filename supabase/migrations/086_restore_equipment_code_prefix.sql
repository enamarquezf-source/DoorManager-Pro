-- DoorManager Pro - restaura el resolver de prefijos de equipos requerido por 082/084/085.

begin;

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

grant execute on function public.dmp_equipment_code_prefix(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
