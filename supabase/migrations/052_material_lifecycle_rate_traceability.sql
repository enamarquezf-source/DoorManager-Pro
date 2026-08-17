-- DoorManager Pro - ciclo de vida de materiales especificos y trazabilidad de tarifas en presupuestos.
-- Idempotente. Mantiene RLS y company_id. Sin borrados destructivos y sin service_role.

begin;

-- Material especifico / a medida: se archiva automaticamente cuando el consumo deja su stock a cero.
alter table public.materials add column if not exists is_specific boolean not null default false;
create index if not exists materials_is_specific_company_idx on public.materials(company_id, is_specific, deleted_at);

-- Trazabilidad de tarifa propuesta en lineas de presupuesto. No recalcula valores historicos.
alter table public.quote_lines add column if not exists quote_rate_id uuid references public.technician_hour_rates(id);
create index if not exists quote_lines_quote_rate_idx on public.quote_lines(quote_id, quote_rate_id) where quote_rate_id is not null;

-- dmp_lifecycle_dependencies: incluye rama materials para archivado/restauracion trazables.
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
  elsif p_entity = 'materials' then
    select coalesce(deleted_at is not null or active = false, false), code, description into v_archived, v_code, v_name from public.materials where id = p_entity_id;
    v_counts := jsonb_build_object(
      'usos en partes', (select count(*) from public.work_order_materials where material_id = p_entity_id),
      'movimientos de stock', (select count(*) from public.material_stock_movements where material_id = p_entity_id),
      'lineas de presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id)
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

-- dmp_restore_entity: incluye rama materials para restauracion trazable de materiales archivados.
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
  elsif p_entity = 'materials' then
    select to_jsonb(t) into v_old from public.materials t where id = p_entity_id for update;
    if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;
    update public.materials set active = true, deleted_at = null, deleted_by = null, delete_reason = null, updated_at = now() where id = p_entity_id returning to_jsonb(materials.*) into v_new;
  end if;

  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, p_entity, p_entity_id, 'UPDATE', p_reason, v_old, v_new);
  return public.dmp_lifecycle_dependencies(p_entity, p_entity_id) || jsonb_build_object('operation', 'restored');
end;
$$;

-- dmp_apply_material_stock_movement: auto-archiva materiales especificos al agotarse su stock por consumo.
-- Los materiales recurrentes con stock a cero permanecen activos.
create or replace function public.dmp_apply_material_stock_movement(
  p_material_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_source text default 'manual',
  p_work_order_id uuid default null,
  p_work_order_material_id uuid default null,
  p_quote_id uuid default null,
  p_unit_cost numeric default null,
  p_created_by uuid default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material public.materials;
  v_previous numeric;
  v_new numeric;
  v_delta numeric;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if p_movement_type not in ('initial','in','out','adjustment','return','correction') then raise exception 'validacion del formulario: tipo de movimiento de stock no valido'; end if;
  select * into v_material from public.materials where id = p_material_id and deleted_at is null for update;
  if v_material.id is null then raise exception 'material: material no encontrado'; end if;
  if not v_material.stock_controlled then return v_material.stock_quantity; end if;
  v_previous := coalesce(v_material.stock_quantity, 0);
  if p_movement_type in ('in','initial','return') then
    v_delta := p_quantity;
  elsif p_movement_type = 'out' then
    v_delta := -p_quantity;
  else
    v_delta := p_quantity - v_previous;
  end if;
  v_new := v_previous + v_delta;
  if v_new < 0 and not v_material.allow_negative_stock then raise exception 'stock: stock insuficiente para %', v_material.code; end if;
  update public.materials set stock_quantity = v_new, last_stock_movement_at = now(), updated_at = now() where id = v_material.id;
  if v_material.is_specific and p_source = 'work_order' and p_movement_type = 'out' and coalesce(v_new, 0) <= 0 then
    update public.materials
       set active = false, deleted_at = coalesce(deleted_at, now()), deleted_by = p_created_by,
           delete_reason = 'Consumido: stock agotado en parte de trabajo', updated_at = now()
     where id = v_material.id;
    insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
    values (v_material.company_id, 'materials', v_material.id, 'SOFT_DELETE', p_created_by, to_jsonb(v_material),
            jsonb_build_object('reason', 'Consumido: stock agotado en parte de trabajo', 'is_specific', true, 'stock_quantity', v_new));
    insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description, metadata)
    values (v_material.company_id, p_created_by, 'eliminacion logica', 'materials', v_material.id,
            'Material específico archivado al consumirse su stock',
            jsonb_build_object('reason', 'Consumido: stock agotado en parte de trabajo', 'operation', 'SOFT_DELETE'));
  end if;
  insert into public.material_stock_movements(company_id, material_id, work_order_id, work_order_material_id, quote_id, movement_type, quantity, previous_stock, new_stock, unit_cost, reason, source, created_by)
  values (v_material.company_id, v_material.id, p_work_order_id, p_work_order_material_id, p_quote_id, p_movement_type, p_quantity, v_previous, v_new, p_unit_cost, nullif(p_reason, ''), p_source, p_created_by);
  return v_new;
end;
$$;

commit;