-- DoorManager Pro - corrige cierre tecnico y flujo atomico de instalacion desde presupuesto.
-- Seguro sobre BBDD con 045/046/047 aplicadas. No desactiva RLS.

begin;

alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log add constraint audit_log_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE'));

create or replace function public.create_work_order_full(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_created_by uuid := (p_payload->>'created_by')::uuid;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_site_id uuid := nullif(p_payload->>'site_id', '')::uuid;
  v_equipment_id uuid := nullif(p_payload->>'main_equipment_id', '')::uuid;
  v_technician_id uuid := nullif(p_payload->>'technician_id', '')::uuid;
  v_quote_id uuid := nullif(p_payload->>'quote_id', '')::uuid;
  v_case_id uuid := nullif(p_payload->>'case_id', '')::uuid;
  v_quote public.quotes;
  v_installation jsonb := coalesce(p_payload->'installation_equipment', '{}'::jsonb);
  v_equipment_type_id uuid := nullif(v_installation->>'equipment_type_id', '')::uuid;
  v_template_id uuid;
  v_check_id uuid;
  v_id uuid;
  v_code text;
  v_equipment_code text;
  v_check_code text;
begin
  if v_company_id is null then raise exception 'validacion del formulario: presupuesto sin empresa'; end if;
  if v_client_id is null then raise exception 'validacion del formulario: presupuesto sin cliente'; end if;
  if v_site_id is null then raise exception 'validacion del formulario: presupuesto sin centro para crear parte'; end if;
  if not public.is_platform_superadmin() then perform public.assert_member_of_current_company(v_company_id); end if;
  if v_created_by is null or v_created_by <> public.current_profile_id() then raise exception 'perfil activo: creador no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']) then raise exception 'permiso: no tienes permisos para crear partes'; end if;
  if not exists (select 1 from public.clients where id = v_client_id and company_id = v_company_id and deleted_at is null) then raise exception 'empresa: cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = v_site_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'empresa: centro no valido'; end if;
  if v_case_id is not null and not exists (select 1 from public.cases where id = v_case_id and company_id = v_company_id and client_id = v_client_id and (site_id is null or site_id = v_site_id) and deleted_at is null) then raise exception 'empresa: expediente no valido'; end if;
  if v_quote_id is not null then
    select * into v_quote from public.quotes where id = v_quote_id and deleted_at is null;
    if v_quote.id is null then raise exception 'presupuesto: presupuesto no valido'; end if;
    if v_quote.company_id <> v_company_id or v_quote.client_id <> v_client_id then raise exception 'presupuesto: no pertenece a la empresa o cliente del parte'; end if;
    if v_quote.site_id is not null and v_quote.site_id is distinct from v_site_id then raise exception 'presupuesto: centro no coincide con el presupuesto'; end if;
    if v_quote.equipment_id is not null and v_quote.equipment_id is distinct from v_equipment_id then raise exception 'presupuesto: equipo no coincide con el presupuesto'; end if;
    if v_quote.case_id is not null and v_quote.case_id is distinct from v_case_id then raise exception 'presupuesto: expediente no coincide con el presupuesto'; end if;
    if lower(coalesce(v_quote.status, '')) not in ('aceptado','ejecutado en cliente') then raise exception 'validacion del formulario: presupuesto no aceptado para generar parte'; end if;
  end if;

  if v_equipment_id is not null and not exists (select 1 from public.equipment where id = v_equipment_id and company_id = v_company_id and client_id = v_client_id and site_id = v_site_id and deleted_at is null) then raise exception 'empresa: equipo no valido'; end if;

  if v_equipment_id is null and coalesce(nullif(p_payload->>'type', ''), 'Correctivo') = 'Instalacion' then
    if v_equipment_type_id is null then raise exception 'validacion del formulario: falta tipo de equipo para el parte de instalacion'; end if;
    if not exists (select 1 from public.equipment_types where id = v_equipment_type_id and active = true and (company_id = v_company_id or company_id is null)) then raise exception 'empresa: tipo de equipo no valido'; end if;
    select id into v_template_id
    from public.check_templates
    where active = true
      and (company_id = v_company_id or company_id is null)
      and equipment_type_id = v_equipment_type_id
      and (lower(name) like '%instal%' or lower(name) like '%puesta en marcha%')
    order by company_id nulls last, updated_at desc, created_at desc
    limit 1;
    if v_template_id is null then raise exception 'validacion del formulario: no existe una plantilla activa de check de instalacion para este tipo de equipo'; end if;
    v_equipment_code := public.next_dmp_code(v_company_id, 'equipment', public.dmp_equipment_code_prefix(v_equipment_type_id), false, 6);
    insert into public.equipment(company_id, code, client_id, site_id, equipment_type_id, brand, model, serial_number, installation_date, internal_location, status, criticality, notes)
    values (v_company_id, v_equipment_code, v_client_id, v_site_id, v_equipment_type_id, nullif(v_installation->>'brand', ''), nullif(v_installation->>'model', ''), nullif(v_installation->>'serial_number', ''), coalesce(nullif(v_installation->>'installation_date', '')::date, current_date), nullif(v_installation->>'internal_location', ''), 'Operativo', coalesce(nullif(v_installation->>'criticality', ''), 'Media'), nullif(v_installation->>'notes', ''))
    returning id into v_equipment_id;
  end if;

  v_code := public.next_dmp_code(v_company_id, 'work_orders', 'PAR', true, 6);
  insert into public.work_orders(company_id, code, case_id, quote_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, scheduled_date, scheduled_time, estimated_duration_minutes, contact_id, access_requirement_id, planned_material, created_by, created_role, updated_by, current_responsible_id)
  values (v_company_id, v_code, v_case_id, v_quote_id, v_client_id, v_site_id, v_equipment_id, coalesce(nullif(p_payload->>'title', ''), 'Parte generado desde presupuesto'), nullif(p_payload->>'description', ''), coalesce(nullif(p_payload->>'type', ''), 'Correctivo'), coalesce(nullif(p_payload->>'priority', ''), 'Normal'), coalesce(nullif(p_payload->>'origin', ''), 'Comercial'), nullif(p_payload->>'scheduled_date', '')::date, nullif(p_payload->>'scheduled_time', '')::time, nullif(p_payload->>'estimated_duration_minutes', '')::integer, nullif(p_payload->>'contact_id', '')::uuid, nullif(p_payload->>'access_requirement_id', '')::uuid, nullif(p_payload->>'planned_material', ''), v_created_by, p_payload->>'created_role', v_created_by, coalesce(v_technician_id, v_created_by))
  returning id into v_id;

  if v_technician_id is not null then
    perform public.assign_technician(v_id, v_technician_id, coalesce(nullif(p_payload->>'scheduled_date', '')::date, current_date), nullif(p_payload->>'scheduled_time', '')::time, null, 'Principal', v_created_by);
  end if;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (v_company_id, v_id, null, 'Pendiente', v_created_by, 'Creacion transaccional de parte ' || v_code);

  if v_template_id is not null then
    v_check_code := public.next_dmp_code(v_company_id, 'checks', 'CHK', true, 6);
    insert into public.checks(company_id, code, work_order_id, equipment_id, template_id, technician_id)
    values (v_company_id, v_check_code, v_id, v_equipment_id, v_template_id, coalesce(v_technician_id, v_created_by))
    returning id into v_check_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_work_order_full(jsonb) to authenticated;

commit;
