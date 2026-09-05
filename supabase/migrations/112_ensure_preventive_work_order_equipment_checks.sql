-- DoorManager Pro - incluye partes preventivos en el contrato de checks por equipo.
-- Reutiliza la función canónica introducida en 111; no toca stock ni facturacion.

begin;

create or replace function public.dmp_ensure_work_order_equipment_check(
  p_company_id uuid,
  p_work_order_id uuid,
  p_equipment_id uuid,
  p_technician_id uuid,
  p_work_order_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type_id uuid;
  v_template_id uuid;
  v_check_id uuid;
begin
  if p_work_order_type not in ('Instalacion', 'Mantenimiento', 'Preventivo') then
    update public.work_order_equipment
    set check_status = 'not_applicable', check_message = null
    where company_id = p_company_id and work_order_id = p_work_order_id and equipment_id = p_equipment_id;
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_work_order_id::text || ':' || p_equipment_id::text));

  select equipment_type_id into v_type_id
  from public.equipment
  where id = p_equipment_id and company_id = p_company_id and deleted_at is null;

  v_template_id := public.dmp_resolve_check_template(p_company_id, v_type_id);
  if v_template_id is null then
    update public.work_order_equipment
    set check_status = 'pending_template', check_message = 'Check pendiente de plantilla'
    where company_id = p_company_id and work_order_id = p_work_order_id and equipment_id = p_equipment_id;
    return null;
  end if;

  select id into v_check_id
  from public.checks
  where work_order_id = p_work_order_id and equipment_id = p_equipment_id and deleted_at is null
  order by created_at
  limit 1;

  if v_check_id is null then
    insert into public.checks(company_id, code, work_order_id, equipment_id, template_id, technician_id)
    values (p_company_id, public.next_dmp_code(p_company_id, 'checks', 'CHK', true, 6), p_work_order_id, p_equipment_id, v_template_id, coalesce(p_technician_id, public.current_profile_id()))
    returning id into v_check_id;
  end if;

  update public.work_order_equipment
  set check_status = 'generated', check_message = null
  where company_id = p_company_id and work_order_id = p_work_order_id and equipment_id = p_equipment_id;
  return v_check_id;
end;
$$;

create or replace function public.generate_pending_installation_check(p_work_order_id uuid, p_equipment_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company_id uuid; v_type text; v_check_id uuid;
begin
  select company_id, type into v_company_id, v_type from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if v_type not in ('Instalacion', 'Mantenimiento', 'Preventivo') then raise exception 'El parte no admite checks por equipo'; end if;
  if not exists (select 1 from public.work_order_equipment where work_order_id = p_work_order_id and equipment_id = p_equipment_id and company_id = v_company_id) then raise exception 'Equipo no asociado al parte'; end if;
  v_check_id := public.dmp_ensure_work_order_equipment_check(v_company_id, p_work_order_id, p_equipment_id, null, v_type);
  if v_check_id is null then raise exception 'No existe una plantilla activa compatible'; end if;
  return v_check_id;
end;
$$;

grant execute on function public.create_work_order_full(jsonb) to authenticated;
grant execute on function public.generate_pending_installation_check(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';

commit;
