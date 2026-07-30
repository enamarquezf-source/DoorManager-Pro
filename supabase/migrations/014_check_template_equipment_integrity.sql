-- DoorManager Pro - integridad plantilla/equipo en checks

create or replace function public.validate_check_template_equipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_type_id uuid;
  v_template_type_id uuid;
begin
  select equipment_type_id into v_equipment_type_id
  from public.equipment
  where id = NEW.equipment_id
    and company_id = NEW.company_id
    and deleted_at is null;

  if v_equipment_type_id is null then raise exception 'Equipo no valido para el check'; end if;

  select equipment_type_id into v_template_type_id
  from public.check_templates
  where id = NEW.template_id
    and active = true
    and (company_id = NEW.company_id or company_id is null);

  if not found then raise exception 'Plantilla no valida para el check'; end if;
  if v_template_type_id is not null and v_template_type_id <> v_equipment_type_id then
    raise exception 'La plantilla no corresponde al tipo de equipo seleccionado';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_checks_validate_template_equipment on public.checks;
create trigger trg_checks_validate_template_equipment
  before insert or update of equipment_id, template_id, company_id on public.checks
  for each row execute function public.validate_check_template_equipment();

grant execute on function public.validate_check_template_equipment() to authenticated;
