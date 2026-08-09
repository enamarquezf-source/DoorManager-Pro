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
       wo.scheduled_date, wo.scheduled_time, wo.diagnosis, wo.work_performed, wo.result,
       ca.code as case_code, c.code as client_code, c.legal_name as client_name, s.code as site_code, s.name as site_name,
       e.code as equipment_code, et.name as equipment_type,
       tech.first_name || ' ' || tech.last_name as main_technician_name,
       creator.first_name || ' ' || creator.last_name as created_by_name,
       wo.deleted_at as deleted_at
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

create or replace function public.dmp_previous_lifecycle_value(p_entity text, p_entity_id uuid, p_key text, p_fallback text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select old_data->>p_key
    from public.audit_log
    where table_name = p_entity
      and record_id = p_entity_id
      and operation = 'SOFT_DELETE'
      and old_data ? p_key
    order by changed_at desc
    limit 1
  ), p_fallback);
$$;

create or replace function public.dmp_assert_profile_lifecycle_target(p_profile_id uuid, p_actor public.profiles, p_action text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles;
  v_remaining_superadmins integer;
  v_target_is_superadmin boolean;
begin
  if not public.is_platform_superadmin() then
    raise exception 'Solo el propietario global puede administrar el ciclo de vida de usuarios';
  end if;

  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null then raise exception 'Usuario no encontrado'; end if;
  if p_profile_id = p_actor.id then raise exception 'No puedes desactivar o restaurar tu propio perfil desde esta operacion'; end if;

  v_target_is_superadmin := v_target.primary_area = 'superadmin' or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = v_target.id and r.name = 'superadmin'
  );

  if p_action = 'archive' and v_target_is_superadmin and v_target.active = true and v_target.deleted_at is null then
    select count(*) into v_remaining_superadmins
    from public.profiles p
    where p.active = true
      and p.deleted_at is null
      and p.id <> v_target.id
      and (
        p.primary_area = 'superadmin'
        or exists (
          select 1
          from public.profile_roles pr
          join public.roles r on r.id = pr.role_id
          where pr.profile_id = p.id and r.name = 'superadmin'
        )
      );
    if v_remaining_superadmins = 0 then
      raise exception 'No se puede desactivar el ultimo superadmin operativo de la plataforma';
    end if;
  end if;

  return v_target;
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
  if p_entity = 'profiles' and not public.is_platform_superadmin() then
    raise exception 'Solo el propietario global puede consultar dependencias de usuarios';
  end if;

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
  v_target_profile public.profiles;
  v_old jsonb;
  v_new jsonb;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);

  if p_entity = 'clients' then
    select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.clients set deleted_at = coalesce(deleted_at, now()), status = case when status = 'Activo' then 'Inactivo' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(clients.*) into v_new;
  elsif p_entity = 'sites' then
    select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.sites set deleted_at = coalesce(deleted_at, now()), active = false, updated_at = now() where id = p_entity_id returning to_jsonb(sites.*) into v_new;
  elsif p_entity = 'equipment' then
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.equipment set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Operativo','Pendiente de revision') then 'Fuera de servicio' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(equipment.*) into v_new;
  elsif p_entity = 'cases' then
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.cases set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Abierto','En curso','Pendiente') then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(cases.*) into v_new;
  elsif p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.work_orders set deleted_at = coalesce(deleted_at, now()), status = case when status not in ('Cerrado','Cancelado') then 'Cancelado' else status end, updated_by = v_actor.id, updated_at = now() where id = p_entity_id returning to_jsonb(work_orders.*) into v_new;
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_company_id, p_entity_id, v_old->>'status', v_new->>'status', v_actor.id, p_reason, true);
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.checks set deleted_at = coalesce(deleted_at, now()), status = case when status <> 'Realizado' then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(checks.*) into v_new;
  elsif p_entity = 'check_templates' then
    select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update;
    if coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;
    update public.check_templates set active = false, updated_at = now() where id = p_entity_id returning to_jsonb(check_templates.*) into v_new;
  elsif p_entity = 'profiles' then
    v_target_profile := public.dmp_assert_profile_lifecycle_target(p_entity_id, v_actor, 'archive');
    select to_jsonb(t) into v_old from public.profiles t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null or coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;
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
  v_target_profile public.profiles;
  v_deps jsonb;
  v_old jsonb;
  v_new jsonb;
  v_previous_status text;
  v_previous_active text;
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
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    v_previous_status := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'status', v_old->>'status');
    if v_previous_status not in ('Activo','Inactivo','Potencial','Bloqueado') then raise exception 'Estado previo de cliente incompatible'; end if;
    update public.clients set deleted_at = null, status = v_previous_status, updated_at = now() where id = p_entity_id returning to_jsonb(clients.*) into v_new;
  elsif p_entity = 'sites' then
    select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    v_previous_active := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'active', v_old->>'active');
    update public.sites set deleted_at = null, active = coalesce(v_previous_active::boolean, true), updated_at = now() where id = p_entity_id returning to_jsonb(sites.*) into v_new;
  elsif p_entity = 'equipment' then
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    v_previous_status := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'status', v_old->>'status');
    if v_previous_status not in ('Operativo','Averiado','Fuera de servicio','Pendiente de revision','Sustituido') then raise exception 'Estado previo de equipo incompatible'; end if;
    update public.equipment set deleted_at = null, status = v_previous_status, updated_at = now() where id = p_entity_id returning to_jsonb(equipment.*) into v_new;
  elsif p_entity = 'cases' then
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    v_previous_status := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'status', v_old->>'status');
    if v_previous_status not in ('Abierto','En curso','Pendiente','Cerrado','Cancelado') then raise exception 'Estado previo de expediente incompatible'; end if;
    update public.cases set deleted_at = null, status = v_previous_status, updated_at = now() where id = p_entity_id returning to_jsonb(cases.*) into v_new;
  elsif p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    v_previous_status := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'status', v_old->>'status');
    if v_previous_status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado') then raise exception 'Estado previo de parte incompatible'; end if;
    update public.work_orders set deleted_at = null, status = v_previous_status, updated_by = v_actor.id, updated_at = now() where id = p_entity_id returning to_jsonb(work_orders.*) into v_new;
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_company_id, p_entity_id, v_old->>'status', v_new->>'status', v_actor.id, p_reason, true);
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    v_previous_status := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'status', v_old->>'status');
    if v_previous_status not in ('Por realizar','En curso','Realizado','Cancelado') then raise exception 'Estado previo de check incompatible'; end if;
    update public.checks set deleted_at = null, status = v_previous_status, updated_at = now() where id = p_entity_id returning to_jsonb(checks.*) into v_new;
  elsif p_entity = 'check_templates' then
    select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update;
    if coalesce((v_old->>'active')::boolean, true) is true then raise exception 'El registro no está archivado'; end if;
    v_previous_active := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'active', v_old->>'active');
    update public.check_templates set active = coalesce(v_previous_active::boolean, true), updated_at = now() where id = p_entity_id returning to_jsonb(check_templates.*) into v_new;
  elsif p_entity = 'profiles' then
    v_target_profile := public.dmp_assert_profile_lifecycle_target(p_entity_id, v_actor, 'restore');
    select to_jsonb(t) into v_old from public.profiles t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null and coalesce((v_old->>'active')::boolean, true) is true then raise exception 'El registro no está archivado'; end if;
    v_previous_active := public.dmp_previous_lifecycle_value(p_entity, p_entity_id, 'active', 'true');
    update public.profiles set active = coalesce(v_previous_active::boolean, true), deleted_at = null, updated_at = now() where id = p_entity_id returning to_jsonb(profiles.*) into v_new;
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

create or replace function public.register_work_order_deficiency(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work public.work_orders;
  v_check public.checks;
  v_equipment_id uuid;
  v_id uuid;
  v_code text;
  v_severity text := p_payload->>'severity';
  v_local_change_id text := nullif(p_payload->>'local_change_id', '');
  v_description text := trim(coalesce(p_payload->>'description', ''));
  v_component text := trim(coalesce(p_payload->>'component', ''));
begin
  if auth.uid() is null then raise exception 'Operacion no permitida para usuarios anonimos'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_profile_id and p.auth_user_id = auth.uid() and p.active = true and p.deleted_at is null) then
    raise exception 'Perfil no encontrado o inactivo';
  end if;

  select * into v_work from public.work_orders where id = (p_payload->>'work_order_id')::uuid and deleted_at is null for update;
  if v_work.id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(v_work.id, v_profile_id)) then raise exception 'No tienes permisos para crear incidencias de este parte'; end if;
  if v_description = '' then raise exception 'Descripcion de incidencia obligatoria'; end if;

  if nullif(p_payload->>'check_id', '') is not null then
    select * into v_check from public.checks where id = (p_payload->>'check_id')::uuid and work_order_id = v_work.id and company_id = v_work.company_id and deleted_at is null;
    if v_check.id is null then raise exception 'Check asociado no valido para este parte'; end if;
  end if;

  v_severity := case v_severity when 'Leve' then 'Baja' when 'Critica' then 'Critica' else coalesce(v_severity, 'Media') end;
  if v_severity not in ('Baja','Media','Alta','Critica') then v_severity := 'Media'; end if;
  select id into v_id from public.deficiencies where company_id = v_work.company_id and local_change_id = v_local_change_id and v_local_change_id is not null;
  if v_id is not null then return v_id; end if;

  v_equipment_id := coalesce(v_check.equipment_id, v_work.main_equipment_id);
  if v_equipment_id is null then
    select equipment_id into v_equipment_id from public.work_order_equipment where work_order_id = v_work.id and company_id = v_work.company_id order by is_primary desc, created_at limit 1;
  end if;
  if v_equipment_id is null then raise exception 'El parte no tiene equipo asociado para vincular la incidencia'; end if;

  v_code := public.next_dmp_code(v_work.company_id, 'deficiencies', 'DEF', true, 6);
  insert into public.deficiencies(company_id, code, check_id, section_id, item_id, work_order_id, equipment_id, client_id, site_id, severity, description, recommended_action, responsible_profile_id, local_change_id)
  select v_work.company_id, v_code, v_check.id, null, null, v_work.id, e.id, e.client_id, e.site_id, v_severity, case when v_component = '' then v_description else '[' || v_component || '] ' || v_description end, nullif(p_payload->>'recommended_action', ''), v_profile_id, v_local_change_id
  from public.equipment e
  where e.id = v_equipment_id and e.company_id = v_work.company_id
  returning id into v_id;
  if v_id is null then raise exception 'Equipo del parte no valido'; end if;
  return v_id;
end;
$$;

revoke all on function public.dmp_lifecycle_allowed_entities() from public;
revoke all on function public.dmp_lifecycle_target_company(text, uuid) from public;
revoke all on function public.dmp_assert_lifecycle_actor(uuid) from public;
revoke all on function public.dmp_lifecycle_dependencies(text, uuid) from public;
revoke all on function public.dmp_record_lifecycle_audit(uuid, public.profiles, text, uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.dmp_archive_entity(text, uuid, text) from public;
revoke all on function public.dmp_restore_entity(text, uuid, text) from public;
revoke all on function public.dmp_permanently_delete_entity(text, uuid, text, text) from public;
revoke all on function public.dmp_previous_lifecycle_value(text, uuid, text, text) from public;
revoke all on function public.dmp_assert_profile_lifecycle_target(uuid, public.profiles, text) from public;
revoke all on function public.create_deficiency_from_check(uuid, uuid, text, text, text, uuid) from public;
revoke all on function public.finish_check_safe(uuid, text) from public;
revoke all on function public.register_work_order_deficiency(jsonb) from public;
revoke all on function public.request_work_order_return(uuid, uuid, text) from public;
revoke all on function public.superadmin_update_profile(uuid, jsonb) from public;
revoke all on function public.sync_work_order_material_usage(uuid, text, numeric, text) from public;

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
    revoke all on function public.dmp_previous_lifecycle_value(text, uuid, text, text) from anon;
    revoke all on function public.dmp_assert_profile_lifecycle_target(uuid, public.profiles, text) from anon;
    revoke all on function public.create_deficiency_from_check(uuid, uuid, text, text, text, uuid) from anon;
    revoke all on function public.finish_check_safe(uuid, text) from anon;
    revoke all on function public.register_work_order_deficiency(jsonb) from anon;
    revoke all on function public.request_work_order_return(uuid, uuid, text) from anon;
    revoke all on function public.superadmin_update_profile(uuid, jsonb) from anon;
    revoke all on function public.sync_work_order_material_usage(uuid, text, numeric, text) from anon;
  end if;
end;
$$;

grant execute on function public.dmp_lifecycle_dependencies(text, uuid) to authenticated;
grant execute on function public.dmp_archive_entity(text, uuid, text) to authenticated;
grant execute on function public.dmp_restore_entity(text, uuid, text) to authenticated;
grant execute on function public.dmp_permanently_delete_entity(text, uuid, text, text) to authenticated;
grant execute on function public.create_deficiency_from_check(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.finish_check_safe(uuid, text) to authenticated;
grant execute on function public.register_work_order_deficiency(jsonb) to authenticated;
grant execute on function public.request_work_order_return(uuid, uuid, text) to authenticated;
grant execute on function public.superadmin_update_profile(uuid, jsonb) to authenticated;
grant execute on function public.sync_work_order_material_usage(uuid, text, numeric, text) to authenticated;

commit;
