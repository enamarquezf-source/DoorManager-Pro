-- DoorManager Pro - controles seguros de archivo, restauracion y borrado definitivo
-- Idempotente. No ejecuta borrados de datos existentes y no desactiva RLS.

begin;

create index if not exists clients_company_deleted_idx on public.clients(company_id, deleted_at);
create index if not exists sites_company_deleted_idx on public.sites(company_id, deleted_at);
create index if not exists equipment_company_deleted_idx on public.equipment(company_id, deleted_at);
create index if not exists cases_company_deleted_idx on public.cases(company_id, deleted_at);
create index if not exists work_orders_company_deleted_idx on public.work_orders(company_id, deleted_at);
create index if not exists checks_company_deleted_idx on public.checks(company_id, deleted_at);
create index if not exists profiles_company_deleted_idx on public.profiles(company_id, deleted_at, active);
create index if not exists check_templates_company_active_idx on public.check_templates(company_id, active);

create or replace view public.v_work_order_full_detail as
select wo.id, wo.company_id, wo.code, wo.title, wo.description, wo.type, wo.priority, wo.status, wo.origin,
       wo.scheduled_date, wo.scheduled_time, wo.diagnosis, wo.work_performed, wo.result, wo.deleted_at,
       ca.code as case_code, c.code as client_code, c.legal_name as client_name, s.code as site_code, s.name as site_name,
       e.code as equipment_code, et.name as equipment_type,
       tech.first_name || ' ' || tech.last_name as main_technician_name,
       creator.first_name || ' ' || creator.last_name as created_by_name
from public.work_orders wo
left join public.cases ca on ca.id = wo.case_id
join public.clients c on c.id = wo.client_id
join public.sites s on s.id = wo.site_id
left join public.equipment e on e.id = wo.main_equipment_id
left join public.equipment_types et on et.id = e.equipment_type_id
left join public.profiles tech on tech.id = wo.main_technician_id
left join public.profiles creator on creator.id = wo.created_by;

alter view if exists public.v_work_order_full_detail set (security_invoker = true);

create or replace function public.dmp_lifecycle_allowed_entities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['clients','sites','equipment','cases','work_orders','checks','check_templates','profiles']::text[];
$$;

create or replace function public.dmp_lifecycle_target_company(p_entity text, p_entity_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_entity <> all(public.dmp_lifecycle_allowed_entities()) then
    raise exception 'Entidad no permitida para gestion de ciclo de vida: %', p_entity;
  end if;

  if p_entity = 'clients' then
    select company_id into v_company_id from public.clients where id = p_entity_id;
  elsif p_entity = 'sites' then
    select company_id into v_company_id from public.sites where id = p_entity_id;
  elsif p_entity = 'equipment' then
    select company_id into v_company_id from public.equipment where id = p_entity_id;
  elsif p_entity = 'cases' then
    select company_id into v_company_id from public.cases where id = p_entity_id;
  elsif p_entity = 'work_orders' then
    select company_id into v_company_id from public.work_orders where id = p_entity_id;
  elsif p_entity = 'checks' then
    select company_id into v_company_id from public.checks where id = p_entity_id;
  elsif p_entity = 'check_templates' then
    select company_id into v_company_id from public.check_templates where id = p_entity_id;
  elsif p_entity = 'profiles' then
    select company_id into v_company_id from public.profiles where id = p_entity_id;
  end if;

  if v_company_id is null then
    raise exception 'Registro no encontrado o sin empresa asociada';
  end if;
  return v_company_id;
end;
$$;

create or replace function public.dmp_assert_lifecycle_actor(p_company_id uuid)
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Operacion no permitida para usuarios anonimos';
  end if;

  select * into v_profile
  from public.profiles
  where id = public.current_profile_id()
    and auth_user_id = auth.uid()
    and active = true
    and deleted_at is null;

  if v_profile.id is null then
    raise exception 'Perfil no encontrado o inactivo';
  end if;

  perform public.assert_member_of_current_company(p_company_id);

  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then
    raise exception 'No tienes permisos para archivar, restaurar o eliminar registros';
  end if;

  return v_profile;
end;
$$;

create or replace function public.dmp_lifecycle_dependencies(p_entity text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_profile public.profiles;
  v_counts jsonb := '{}'::jsonb;
  v_total integer := 0;
  v_archived boolean := false;
  v_code text;
  v_name text;
  v_restorable boolean := true;
  v_restore_blocker text := null;
begin
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_profile := public.dmp_assert_lifecycle_actor(v_company_id);

  if p_entity = 'clients' then
    select coalesce(deleted_at is not null, false), code, legal_name into v_archived, v_code, v_name from public.clients where id = p_entity_id;
    v_counts := jsonb_build_object(
      'contactos', (select count(*) from public.client_contacts where client_id = p_entity_id),
      'centros', (select count(*) from public.sites where client_id = p_entity_id),
      'equipos', (select count(*) from public.equipment where client_id = p_entity_id),
      'expedientes', (select count(*) from public.cases where client_id = p_entity_id),
      'partes', (select count(*) from public.work_orders where client_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where client_id = p_entity_id),
      'documentos', (select count(*) from public.document_links where related_type = 'Cliente' and related_id = p_entity_id)
    );
  elsif p_entity = 'sites' then
    select coalesce(deleted_at is not null, false), code, name into v_archived, v_code, v_name from public.sites where id = p_entity_id;
    v_counts := jsonb_build_object(
      'contactos', (select count(*) from public.site_contacts where site_id = p_entity_id),
      'equipos', (select count(*) from public.equipment where site_id = p_entity_id),
      'expedientes', (select count(*) from public.cases where site_id = p_entity_id),
      'partes', (select count(*) from public.work_orders where site_id = p_entity_id),
      'checks', (select count(*) from public.checks ch join public.equipment e on e.id = ch.equipment_id where e.site_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where site_id = p_entity_id),
      'documentos', (select count(*) from public.document_links where related_type = 'Centro' and related_id = p_entity_id)
    );
    if exists (select 1 from public.sites s join public.clients c on c.id = s.client_id where s.id = p_entity_id and c.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El cliente del centro sigue archivado. Restaura primero el cliente.';
    end if;
  elsif p_entity = 'equipment' then
    select coalesce(deleted_at is not null, false), code, coalesce(brand || ' ' || model, code) into v_archived, v_code, v_name from public.equipment where id = p_entity_id;
    v_counts := jsonb_build_object(
      'componentes', (select count(*) from public.equipment_components where equipment_id = p_entity_id),
      'historial', (select count(*) from public.equipment_status_history where equipment_id = p_entity_id),
      'fotos', (select count(*) from public.equipment_photos where equipment_id = p_entity_id),
      'partes', (select count(*) from public.work_orders where main_equipment_id = p_entity_id) + (select count(*) from public.work_order_equipment where equipment_id = p_entity_id),
      'checks', (select count(*) from public.checks where equipment_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where equipment_id = p_entity_id),
      'documentos', (select count(*) from public.document_links where related_type = 'Equipo' and related_id = p_entity_id)
    );
    if exists (select 1 from public.equipment e join public.clients c on c.id = e.client_id where e.id = p_entity_id and c.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El cliente del equipo sigue archivado. Restaura primero el cliente.';
    elsif exists (select 1 from public.equipment e join public.sites s on s.id = e.site_id where e.id = p_entity_id and s.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El centro del equipo sigue archivado. Restaura primero el centro.';
    end if;
  elsif p_entity = 'cases' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.cases where id = p_entity_id;
    v_counts := jsonb_build_object(
      'eventos', (select count(*) from public.case_events where case_id = p_entity_id),
      'vinculos', (select count(*) from public.case_links where case_id = p_entity_id),
      'documentos', (select count(*) from public.case_documents where case_id = p_entity_id) + (select count(*) from public.document_links where related_type = 'Expediente' and related_id = p_entity_id),
      'partes', (select count(*) from public.work_orders where case_id = p_entity_id),
      'oportunidades', (select count(*) from public.opportunities where case_id = p_entity_id),
      'presupuestos', (select count(*) from public.quotes where case_id = p_entity_id)
    );
    if exists (select 1 from public.cases ca join public.clients c on c.id = ca.client_id where ca.id = p_entity_id and c.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El cliente del expediente sigue archivado. Restaura primero el cliente.';
    elsif exists (select 1 from public.cases ca join public.sites s on s.id = ca.site_id where ca.id = p_entity_id and s.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El centro del expediente sigue archivado. Restaura primero el centro.';
    end if;
  elsif p_entity = 'work_orders' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.work_orders where id = p_entity_id;
    v_counts := jsonb_build_object(
      'equipos_adicionales', (select count(*) from public.work_order_equipment where work_order_id = p_entity_id),
      'asignaciones', (select count(*) from public.work_order_assignments where work_order_id = p_entity_id),
      'historial_estados', (select count(*) from public.work_order_status_history where work_order_id = p_entity_id),
      'notas', (select count(*) from public.work_order_notes where work_order_id = p_entity_id),
      'materiales', (select count(*) from public.work_order_materials where work_order_id = p_entity_id),
      'fotos', (select count(*) from public.work_order_photos where work_order_id = p_entity_id),
      'firmas', (select count(*) from public.work_order_signatures where work_order_id = p_entity_id),
      'checks', (select count(*) from public.checks where work_order_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where work_order_id = p_entity_id or origin_work_order_id = p_entity_id),
      'documentos', (select count(*) from public.document_links where related_type = 'Parte' and related_id = p_entity_id)
    );
    if exists (select 1 from public.work_orders wo join public.clients c on c.id = wo.client_id where wo.id = p_entity_id and c.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El cliente del parte sigue archivado. Restaura primero el cliente.';
    elsif exists (select 1 from public.work_orders wo join public.sites s on s.id = wo.site_id where wo.id = p_entity_id and s.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El centro del parte sigue archivado. Restaura primero el centro.';
    elsif exists (select 1 from public.work_orders wo join public.equipment e on e.id = wo.main_equipment_id where wo.id = p_entity_id and e.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El equipo principal del parte sigue archivado. Restaura primero el equipo.';
    end if;
  elsif p_entity = 'checks' then
    select coalesce(deleted_at is not null, false), code, code into v_archived, v_code, v_name from public.checks where id = p_entity_id;
    v_counts := jsonb_build_object(
      'resultados_secciones', (select count(*) from public.check_section_results where check_id = p_entity_id),
      'resultados_items', (select count(*) from public.check_item_results where check_id = p_entity_id),
      'fotos', (select count(*) from public.check_photos where check_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where check_id = p_entity_id)
    );
    if exists (select 1 from public.checks ch join public.equipment e on e.id = ch.equipment_id where ch.id = p_entity_id and e.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El equipo del check sigue archivado. Restaura primero el equipo.';
    elsif exists (select 1 from public.checks ch join public.work_orders wo on wo.id = ch.work_order_id where ch.id = p_entity_id and wo.deleted_at is not null) then
      v_restorable := false; v_restore_blocker := 'El parte del check sigue archivado. Restaura primero el parte.';
    end if;
  elsif p_entity = 'check_templates' then
    select not active, name, name into v_archived, v_code, v_name from public.check_templates where id = p_entity_id;
    v_counts := jsonb_build_object(
      'checks', (select count(*) from public.checks where template_id = p_entity_id),
      'secciones', (select count(*) from public.check_template_sections where template_id = p_entity_id),
      'items', (select count(*) from public.check_template_items i join public.check_template_sections s on s.id = i.section_id where s.template_id = p_entity_id)
    );
  elsif p_entity = 'profiles' then
    select coalesce(deleted_at is not null or active = false, false), email, first_name || ' ' || last_name into v_archived, v_code, v_name from public.profiles where id = p_entity_id;
    v_counts := jsonb_build_object(
      'partes_creados', (select count(*) from public.work_orders where created_by = p_entity_id),
      'partes_responsable', (select count(*) from public.work_orders where current_responsible_id = p_entity_id or main_technician_id = p_entity_id),
      'asignaciones', (select count(*) from public.work_order_assignments where technician_id = p_entity_id),
      'checks', (select count(*) from public.checks where technician_id = p_entity_id),
      'historial', (select count(*) from public.work_order_status_history where changed_by = p_entity_id),
      'fotos', (select count(*) from public.work_order_photos where taken_by = p_entity_id) + (select count(*) from public.check_photos where taken_by = p_entity_id)
    );
  end if;

  select coalesce(sum(value::text::integer), 0) into v_total from jsonb_each(v_counts);

  return jsonb_build_object(
    'entity', p_entity,
    'id', p_entity_id,
    'company_id', v_company_id,
    'code', coalesce(v_code, p_entity_id::text),
    'name', coalesce(v_name, v_code, p_entity_id::text),
    'archived', v_archived,
    'dependencies', v_counts,
    'dependency_total', v_total,
    'can_archive', true,
    'can_restore', v_restorable,
    'restore_blocker', v_restore_blocker,
    'can_permanently_delete', case when p_entity = 'profiles' then false else v_total = 0 end,
    'physical_delete_blocker', case when p_entity = 'profiles' then 'Las cuentas Auth no se borran desde la aplicacion. Desactiva el perfil DMP.' when v_total > 0 then 'Existen relaciones o historial que obligan a archivar en lugar de borrar definitivamente.' else null end
  );
end;
$$;

create or replace function public.dmp_record_lifecycle_audit(p_company_id uuid, p_actor public.profiles, p_entity text, p_entity_id uuid, p_operation text, p_reason text, p_old jsonb, p_new jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (p_company_id, p_entity, p_entity_id, p_operation, p_actor.id, p_old, p_new);

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description, metadata)
  values (
    p_company_id,
    p_actor.id,
    case when p_operation in ('SOFT_DELETE','DELETE') then 'eliminacion logica' else 'modificacion' end,
    p_entity,
    p_entity_id,
    case p_operation when 'SOFT_DELETE' then 'Registro archivado' when 'UPDATE' then 'Registro restaurado' when 'DELETE' then 'Registro eliminado definitivamente' else p_operation end,
    jsonb_build_object('reason', p_reason, 'role', p_actor.primary_area, 'operation', p_operation)
  );
end;
$$;

create or replace function public.dmp_archive_entity(p_entity text, p_entity_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_old jsonb;
  v_new jsonb;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);

  if p_entity = 'clients' then
    select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update;
    update public.clients set deleted_at = coalesce(deleted_at, now()), status = case when status = 'Activo' then 'Inactivo' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(clients.*) into v_new;
  elsif p_entity = 'sites' then
    select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update;
    update public.sites set deleted_at = coalesce(deleted_at, now()), active = false, updated_at = now() where id = p_entity_id returning to_jsonb(sites.*) into v_new;
  elsif p_entity = 'equipment' then
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update;
    update public.equipment set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Operativo','Pendiente de revision') then 'Fuera de servicio' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(equipment.*) into v_new;
  elsif p_entity = 'cases' then
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update;
    update public.cases set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Abierto','En curso','Pendiente') then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(cases.*) into v_new;
  elsif p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    update public.work_orders set deleted_at = coalesce(deleted_at, now()), status = case when status not in ('Cerrado','Cancelado') then 'Cancelado' else status end, updated_by = v_actor.id, updated_at = now() where id = p_entity_id returning to_jsonb(work_orders.*) into v_new;
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_company_id, p_entity_id, v_old->>'status', v_new->>'status', v_actor.id, p_reason, true);
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    update public.checks set deleted_at = coalesce(deleted_at, now()), status = case when status <> 'Realizado' then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(checks.*) into v_new;
  elsif p_entity = 'check_templates' then
    select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update;
    update public.check_templates set active = false, updated_at = now() where id = p_entity_id returning to_jsonb(check_templates.*) into v_new;
  elsif p_entity = 'profiles' then
    if p_entity_id = v_actor.id then raise exception 'No puedes desactivar tu propio perfil desde esta operacion'; end if;
    select to_jsonb(t) into v_old from public.profiles t where id = p_entity_id for update;
    update public.profiles set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now() where id = p_entity_id returning to_jsonb(profiles.*) into v_new;
  end if;

  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, p_entity, p_entity_id, 'SOFT_DELETE', p_reason, v_old, v_new);
  return public.dmp_lifecycle_dependencies(p_entity, p_entity_id) || jsonb_build_object('operation', 'archived');
end;
$$;

create or replace function public.dmp_restore_entity(p_entity text, p_entity_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_deps jsonb;
  v_old jsonb;
  v_new jsonb;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);
  v_deps := public.dmp_lifecycle_dependencies(p_entity, p_entity_id);
  if coalesce((v_deps->>'can_restore')::boolean, false) is not true then
    raise exception '%', coalesce(v_deps->>'restore_blocker', 'No se puede restaurar por dependencias archivadas');
  end if;

  if p_entity = 'clients' then
    select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update;
    update public.clients set deleted_at = null, status = case when status = 'Inactivo' then 'Activo' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(clients.*) into v_new;
  elsif p_entity = 'sites' then
    select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update;
    update public.sites set deleted_at = null, active = true, updated_at = now() where id = p_entity_id returning to_jsonb(sites.*) into v_new;
  elsif p_entity = 'equipment' then
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update;
    update public.equipment set deleted_at = null, updated_at = now() where id = p_entity_id returning to_jsonb(equipment.*) into v_new;
  elsif p_entity = 'cases' then
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update;
    update public.cases set deleted_at = null, updated_at = now() where id = p_entity_id returning to_jsonb(cases.*) into v_new;
  elsif p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    update public.work_orders set deleted_at = null, updated_by = v_actor.id, updated_at = now() where id = p_entity_id returning to_jsonb(work_orders.*) into v_new;
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    update public.checks set deleted_at = null, updated_at = now() where id = p_entity_id returning to_jsonb(checks.*) into v_new;
  elsif p_entity = 'check_templates' then
    select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update;
    update public.check_templates set active = true, updated_at = now() where id = p_entity_id returning to_jsonb(check_templates.*) into v_new;
  elsif p_entity = 'profiles' then
    select to_jsonb(t) into v_old from public.profiles t where id = p_entity_id for update;
    update public.profiles set active = true, deleted_at = null, updated_at = now() where id = p_entity_id returning to_jsonb(profiles.*) into v_new;
  end if;

  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, p_entity, p_entity_id, 'UPDATE', p_reason, v_old, v_new);
  return public.dmp_lifecycle_dependencies(p_entity, p_entity_id) || jsonb_build_object('operation', 'restored');
end;
$$;

create or replace function public.dmp_permanently_delete_entity(p_entity text, p_entity_id uuid, p_reason text, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_deps jsonb;
  v_old jsonb;
  v_code text;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);
  v_deps := public.dmp_lifecycle_dependencies(p_entity, p_entity_id);
  v_code := coalesce(v_deps->>'code', p_entity_id::text);

  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then
    raise exception 'Confirmacion incorrecta. Escribe ELIMINAR %', v_code;
  end if;
  if coalesce((v_deps->>'can_permanently_delete')::boolean, false) is not true then
    raise exception '%', coalesce(v_deps->>'physical_delete_blocker', 'El registro tiene dependencias y no puede borrarse definitivamente');
  end if;

  if p_entity = 'clients' then select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update; delete from public.clients where id = p_entity_id;
  elsif p_entity = 'sites' then select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update; delete from public.sites where id = p_entity_id;
  elsif p_entity = 'equipment' then select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update; delete from public.equipment where id = p_entity_id;
  elsif p_entity = 'cases' then select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update; delete from public.cases where id = p_entity_id;
  elsif p_entity = 'work_orders' then select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update; delete from public.work_orders where id = p_entity_id;
  elsif p_entity = 'checks' then select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update; delete from public.checks where id = p_entity_id;
  elsif p_entity = 'check_templates' then select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update; delete from public.check_templates where id = p_entity_id;
  elsif p_entity = 'profiles' then raise exception 'Las cuentas Auth no se borran desde la aplicacion. Desactiva el perfil DMP.';
  end if;

  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, p_entity, p_entity_id, 'DELETE', p_reason, v_old, jsonb_build_object('deleted', true, 'reason', p_reason));
  return jsonb_build_object('operation', 'permanently_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code);
end;
$$;

-- Lectura de archivados para roles autorizados. Los roles no autorizados conservan solo activos.
drop policy if exists clients_select_business on public.clients;
create policy clients_select_business on public.clients for select to authenticated
  using (company_id = public.current_company_id() and ((deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])) or public.has_any_role(array['superadmin','SAT','Gerencia'])));

drop policy if exists sites_select_business on public.sites;
create policy sites_select_business on public.sites for select to authenticated
  using (company_id = public.current_company_id() and ((deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])) or public.has_any_role(array['superadmin','SAT','Gerencia'])));

drop policy if exists equipment_select_business on public.equipment;
create policy equipment_select_business on public.equipment for select to authenticated
  using (company_id = public.current_company_id() and ((deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])) or public.has_any_role(array['superadmin','SAT','Gerencia'])));

drop policy if exists cases_select_scoped on public.cases;
create policy cases_select_scoped on public.cases for select to authenticated
  using (company_id = public.current_company_id() and ((deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])) or public.has_any_role(array['superadmin','SAT','Gerencia'])));

drop policy if exists work_orders_select_by_role on public.work_orders;
create policy work_orders_select_by_role on public.work_orders for select to authenticated
  using (company_id = public.current_company_id() and ((deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or public.is_assigned_to_work_order(id))) or public.has_any_role(array['superadmin','SAT','Gerencia'])));

drop policy if exists checks_select_by_role on public.checks;
create policy checks_select_by_role on public.checks for select to authenticated
  using (company_id = public.current_company_id() and ((deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or technician_id = public.current_profile_id() or public.is_assigned_to_work_order(work_order_id))) or public.has_any_role(array['superadmin','SAT','Gerencia'])));

revoke all on function public.dmp_lifecycle_allowed_entities() from public;
revoke all on function public.dmp_lifecycle_target_company(text, uuid) from public;
revoke all on function public.dmp_assert_lifecycle_actor(uuid) from public;
revoke all on function public.dmp_lifecycle_dependencies(text, uuid) from public;
revoke all on function public.dmp_record_lifecycle_audit(uuid, public.profiles, text, uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.dmp_archive_entity(text, uuid, text) from public;
revoke all on function public.dmp_restore_entity(text, uuid, text) from public;
revoke all on function public.dmp_permanently_delete_entity(text, uuid, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.dmp_lifecycle_allowed_entities() from anon;
    revoke all on function public.dmp_lifecycle_target_company(text, uuid) from anon;
    revoke all on function public.dmp_assert_lifecycle_actor(uuid) from anon;
    revoke all on function public.dmp_lifecycle_dependencies(text, uuid) from anon;
    revoke all on function public.dmp_record_lifecycle_audit(uuid, public.profiles, text, uuid, text, text, jsonb, jsonb) from anon;
    revoke all on function public.dmp_archive_entity(text, uuid, text) from anon;
    revoke all on function public.dmp_restore_entity(text, uuid, text) from anon;
    revoke all on function public.dmp_permanently_delete_entity(text, uuid, text, text) from anon;
  end if;
end;
$$;

grant execute on function public.dmp_lifecycle_dependencies(text, uuid) to authenticated;
grant execute on function public.dmp_archive_entity(text, uuid, text) to authenticated;
grant execute on function public.dmp_restore_entity(text, uuid, text) to authenticated;
grant execute on function public.dmp_permanently_delete_entity(text, uuid, text, text) to authenticated;

commit;
