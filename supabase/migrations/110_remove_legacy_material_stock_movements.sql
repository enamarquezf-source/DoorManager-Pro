-- DoorManager Pro - remove the retired global material movement ledger.
-- Historical rows must be audited/exported before this migration is applied.
begin;

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
      'documentos', (select count(*) from public.document_links where related_type = 'Cliente' and related_id = p_entity_id),
      'avisos', (select count(*) from public.alerts where related_entity = 'clients' and related_id = p_entity_id)
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
      'documentos', (select count(*) from public.document_links where related_type = 'Centro' and related_id = p_entity_id),
      'avisos', (select count(*) from public.alerts where related_entity = 'sites' and related_id = p_entity_id)
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
      'presupuestos', (select count(*) from public.quotes where equipment_id = p_entity_id),
      'documentos', (select count(*) from public.document_links where related_type = 'Equipo' and related_id = p_entity_id),
      'avisos', (select count(*) from public.alerts where related_entity = 'equipment' and related_id = p_entity_id)
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
      'presupuestos', (select count(*) from public.quotes where case_id = p_entity_id),
      'avisos', (select count(*) from public.alerts where related_entity = 'cases' and related_id = p_entity_id)
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
      'horas', (select count(*) from public.work_order_time_entries where work_order_id = p_entity_id),
      'materiales', (select count(*) from public.work_order_materials where work_order_id = p_entity_id),
      'fotos', (select count(*) from public.work_order_photos where work_order_id = p_entity_id),
      'firmas', (select count(*) from public.work_order_signatures where work_order_id = p_entity_id),
      'checks', (select count(*) from public.checks where work_order_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where work_order_id = p_entity_id or origin_work_order_id = p_entity_id),
      'movimientos de stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id),
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
      'deficiencias', (select count(*) from public.deficiencies where check_id = p_entity_id),
      'avisos', (select count(*) from public.alerts where related_entity = 'checks' and related_id = p_entity_id)
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
    select coalesce(deleted_at is not null, false), code, description into v_archived, v_code, v_name from public.materials where id = p_entity_id;
    v_counts := jsonb_build_object(
      'usos en partes', (select count(*) from public.work_order_materials where material_id = p_entity_id),
      'lineas de presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id),
      'existencias', (select count(*) from public.warehouse_stock where material_id = p_entity_id),
      'movimientos historicos', (select count(*) from public.stock_movements where material_id = p_entity_id)
    );
  elsif p_entity = 'quotes' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.quotes where id = p_entity_id;
    v_counts := jsonb_build_object(
      'lineas', (select count(*) from public.quote_lines where quote_id = p_entity_id),
      'historial', (select count(*) from public.quote_status_history where quote_id = p_entity_id),
      'partes generados', (select count(*) from public.work_orders where quote_id = p_entity_id),
      'decisiones previstas', (select count(*) from public.work_order_planned_material_decisions where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id)) + (select count(*) from public.work_order_quote_line_decisions where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id)),
      'costes presupuestados', (select count(*) from public.work_order_cost_entries where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id)),
      'deficiencias', (select count(*) from public.deficiencies where origin_quote_id = p_entity_id),
      'vinculos', (select count(*) from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id)
    );
  elsif p_entity = 'equipment_components' then
    select coalesce(deleted_at is not null, false), coalesce(serial_number, component_type), coalesce(nullif(brand || ' ' || model, ' '), serial_number, component_type) into v_archived, v_code, v_name from public.equipment_components where id = p_entity_id;
    v_counts := jsonb_build_object();
  elsif p_entity = 'documents' then
    select coalesce(deleted_at is not null or valid = false, false), title, title into v_archived, v_code, v_name from public.documents where id = p_entity_id;
    v_counts := jsonb_build_object('vinculos', (select count(*) from public.document_links where document_id = p_entity_id));
  elsif p_entity = 'alerts' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.alerts where id = p_entity_id;
    v_counts := jsonb_build_object(
      'destinatarios', (select count(*) from public.alert_recipients where alert_id = p_entity_id),
      'vinculos de incidencia', (select count(*) from public.deficiencies where origin_alert_id = p_entity_id)
    );
  elsif p_entity = 'opportunities' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.opportunities where id = p_entity_id;
    v_counts := jsonb_build_object(
      'presupuestos', (select count(*) from public.quotes where opportunity_id = p_entity_id),
      'vinculos de incidencia', (select count(*) from public.deficiencies where origin_opportunity_id = p_entity_id)
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

create or replace function public.dmp_lifecycle_delete_plan(p_entity text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cascade jsonb := '{}'::jsonb;
  v_blocking jsonb := '{}'::jsonb;
  v_can boolean := false;
begin
  if p_entity = 'work_orders' then
    v_cascade := jsonb_build_object(
      'equipos_adicionales', (select count(*) from public.work_order_equipment where work_order_id = p_entity_id),
      'asignaciones', (select count(*) from public.work_order_assignments where work_order_id = p_entity_id),
      'historial_estados', (select count(*) from public.work_order_status_history where work_order_id = p_entity_id),
      'notas', (select count(*) from public.work_order_notes where work_order_id = p_entity_id),
      'horas', (select count(*) from public.work_order_time_entries where work_order_id = p_entity_id),
      'materiales', (select count(*) from public.work_order_materials where work_order_id = p_entity_id),
      'recursos_costes', (select count(*) from public.work_order_cost_entries where work_order_id = p_entity_id),
      'decisiones_materiales_previstos', (select count(*) from public.work_order_planned_material_decisions where work_order_id = p_entity_id),
      'decisiones_conceptos_previstos', (select count(*) from public.work_order_quote_line_decisions where work_order_id = p_entity_id),
      'fotos', (select count(*) from public.work_order_photos where work_order_id = p_entity_id),
      'firmas', (select count(*) from public.work_order_signatures where work_order_id = p_entity_id),
      'checks', (select count(*) from public.checks where work_order_id = p_entity_id),
      'deficiencias_propias', (select count(*) from public.deficiencies where work_order_id = p_entity_id),
      'acciones_correctivas', (select count(*) from public.corrective_actions where deficiency_id in (select id from public.deficiencies where work_order_id = p_entity_id)),
      'avisos', (select count(*) from public.alerts where related_entity = 'work_orders' and related_id = p_entity_id),
      'solicitudes_material', (select count(*) from public.material_requests where work_order_id = p_entity_id),
      'presupuestos_vinculados', (select count(*) from public.quotes where work_order_id = p_entity_id)
    );
    v_blocking := jsonb_build_object(
      'documentos_enlazados', (select count(*) from public.document_links where related_type = 'Parte' and related_id = p_entity_id),
      'movimientos_stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id),
      'deficiencias_externas', (select count(*) from public.deficiencies where origin_work_order_id = p_entity_id and work_order_id is distinct from p_entity_id),
      'referencias_deficiencias_no_clasificadas', public.dmp_deficiency_blocking_reference_count(array(select id from public.deficiencies where work_order_id = p_entity_id))
    );
  elsif p_entity = 'checks' then
    v_cascade := jsonb_build_object(
      'resultados_secciones', (select count(*) from public.check_section_results where check_id = p_entity_id),
      'resultados_items', (select count(*) from public.check_item_results where check_id = p_entity_id),
      'fotos', (select count(*) from public.check_photos where check_id = p_entity_id)
    );
    v_blocking := jsonb_build_object('deficiencias', (select count(*) from public.deficiencies where check_id = p_entity_id));
  elsif p_entity = 'equipment' then
    v_cascade := jsonb_build_object(
      'componentes', (select count(*) from public.equipment_components where equipment_id = p_entity_id),
      'historial', (select count(*) from public.equipment_status_history where equipment_id = p_entity_id),
      'fotos', (select count(*) from public.equipment_photos where equipment_id = p_entity_id),
      'checks_directos', (select count(*) from public.checks where equipment_id = p_entity_id and work_order_id is null),
      'avisos', (select count(*) from public.alerts where related_entity = 'equipment' and related_id = p_entity_id)
    );
    v_blocking := jsonb_build_object(
      'partes_activos', (select count(*) from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is null),
      'partes_archivados', (select count(*) from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is not null),
      'deficiencias', (select count(*) from public.deficiencies where equipment_id = p_entity_id),
      'presupuestos', (select count(*) from public.quotes where equipment_id = p_entity_id),
      'documentos', (select count(*) from public.document_links where related_type = 'Equipo' and related_id = p_entity_id)
    );
  elsif p_entity = 'opportunities' then
    v_blocking := jsonb_build_object(
      'presupuestos', (select count(*) from public.quotes where opportunity_id = p_entity_id),
      'vinculos_de_incidencia', (select count(*) from public.deficiencies where origin_opportunity_id = p_entity_id)
    );
  elsif p_entity = 'quotes' then
    v_cascade := jsonb_build_object(
      'lineas', (select count(*) from public.quote_lines where quote_id = p_entity_id),
      'historial', (select count(*) from public.quote_status_history where quote_id = p_entity_id),
      'vinculos', (select count(*) from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id)
    );
    v_blocking := jsonb_build_object(
      'partes_generados', (select count(*) from public.work_orders where quote_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where origin_quote_id = p_entity_id)
    );
  elsif p_entity = 'materials' then
    v_blocking := jsonb_build_object(
      'usos_en_partes', (select count(*) from public.work_order_materials where material_id = p_entity_id),
      'movimientos_stock', (select count(*) from public.stock_movements where material_id = p_entity_id),
      'lineas_presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id),
      'existencias', (select count(*) from public.warehouse_stock where material_id = p_entity_id),
      'stock_activo', case when coalesce((select sum(ws.quantity) from public.warehouse_stock ws where ws.material_id = p_entity_id), 0) > 0 then 1 else 0 end
    );
  elsif p_entity = 'documents' then
    v_blocking := jsonb_build_object('vinculos', (select count(*) from public.document_links where document_id = p_entity_id));
  elsif p_entity = 'alerts' then
    v_blocking := jsonb_build_object(
      'destinatarios', (select count(*) from public.alert_recipients where alert_id = p_entity_id),
      'vinculos_de_incidencia', (select count(*) from public.deficiencies where origin_alert_id = p_entity_id)
    );
  elsif p_entity = 'equipment_components' then
    v_blocking := jsonb_build_object();
  elsif p_entity = 'cases' then
    v_blocking := jsonb_build_object(
      'partes', (select count(*) from public.work_orders where case_id = p_entity_id),
      'presupuestos', (select count(*) from public.quotes where case_id = p_entity_id),
      'oportunidades', (select count(*) from public.opportunities where case_id = p_entity_id)
    );
  elsif p_entity in ('clients','sites','check_templates') then
    v_blocking := jsonb_build_object('dependencias', 1);
  end if;

  select coalesce(sum(value::text::integer), 0) = 0 into v_can from jsonb_each(v_blocking);
  return jsonb_build_object('can_controlled_cascade_delete', p_entity in ('work_orders','checks') and v_can, 'cascade_dependencies', v_cascade, 'blocking_dependencies', v_blocking);
end;
$$;

create or replace function public.dmp_purge_entity_with_cleanup_legacy(
  p_entity text,
  p_entity_id uuid,
  p_reason text,
  p_confirmation text,
  p_scope jsonb default '{}'::jsonb,
  p_return_stock boolean default true,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_deps jsonb;
  v_plan jsonb;
  v_code text;
  v_old jsonb;
  v_file_ids uuid[] := '{}';
  v_deficiency_ids uuid[] := '{}';
  v_file_snapshot jsonb := '[]'::jsonb;
  v_queued_files integer := 0;
  v_refunded numeric := 0;
  v_doc_mode text := coalesce(nullif(p_scope->>'documents', ''), 'block');
  v_force boolean := coalesce((p_scope->>'force')::boolean, false);
  v_purge_wo boolean := coalesce((p_scope->>'purge_related_work_orders')::boolean, false);
  v_stock_mode text := coalesce(nullif(p_scope->>'stock_movements', ''), 'block');
  v_usage public.work_order_materials;
  v_wo public.work_orders;
  v_wo_code text;
  v_child record;
  v_quote public.quotes;
  v_quote_code text;
  v_count integer;
  v_exists integer;
  v_num integer;
  v_material public.materials;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'purga: el motivo es obligatorio'; end if;
  if not public.is_platform_superadmin() then
    raise exception 'purga: solo el propietario global puede ejecutar purgas definitivas. SAT, Gerencia y Oficina conservan el archivo y el borrado clasico.';
  end if;
  if p_entity = 'profiles' then raise exception 'purga: las cuentas Auth no se eliminan desde la aplicacion'; end if;

  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);
  v_deps := public.dmp_lifecycle_dependencies(p_entity, p_entity_id);
  v_plan := public.dmp_lifecycle_delete_plan(p_entity, p_entity_id);
  v_code := coalesce(v_deps->>'code', p_entity_id::text);
  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then raise exception 'purga: confirmacion incorrecta. Escribe ELIMINAR %', v_code; end if;
  if p_dry_run then
    return jsonb_build_object('operation', 'dry_run', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'company_id', v_company_id, 'dry_run', true, 'plan', v_deps || v_plan, 'message', 'No se ha modificado nada. Repite la llamada con dry_run=false para purgar.');
  end if;

  perform pg_advisory_xact_lock(hashtext('dmp_purge:' || p_entity || ':' || p_entity_id::text));

  if p_entity = 'work_orders' then
    select 1 into v_exists from public.work_orders where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id;
    if exists (select 1 from public.document_links where related_type = 'Parte' and related_id = p_entity_id) then
      v_queued_files := v_queued_files + public.dmp_purge_document_links('Parte', p_entity_id, v_doc_mode, v_actor.id, p_reason);
    end if;
    if exists (select 1 from public.stock_movements where work_order_id = p_entity_id) then
      if v_stock_mode <> 'purge' then raise exception 'purga: hay movimientos de stock historicos vinculados al parte. Usa scope.stock_movements.enable para purgarlos.'; end if;
      delete from public.stock_movements where work_order_id = p_entity_id;
    end if;
    if exists (select 1 from public.deficiencies where origin_work_order_id = p_entity_id and work_order_id is distinct from p_entity_id) then raise exception 'purga: hay deficiencias externas vinculadas a este parte. Resuelve esos vinculos antes de purgar.'; end if;
    select coalesce(array_agg(id), '{}') into v_deficiency_ids from public.deficiencies where work_order_id = p_entity_id or check_id in (select id from public.checks where work_order_id = p_entity_id);
    if public.dmp_deficiency_blocking_reference_count(v_deficiency_ids) > 0 then raise exception 'purga: hay referencias no clasificadas hacia deficiencias del parte. No se puede purgar definitivamente.'; end if;
    if p_return_stock then
      for v_usage in select * from public.work_order_materials where work_order_id = p_entity_id loop
        perform public.dmp_refund_work_order_material_stock(v_usage.id, v_actor.id, p_reason);
        v_refunded := v_refunded + coalesce(v_usage.stock_deducted_quantity, 0);
      end loop;
      delete from public.stock_movements where work_order_id = p_entity_id;
    end if;
    select coalesce(array_agg(file_id), '{}') into v_file_ids from (
      select file_id from public.work_order_photos where work_order_id = p_entity_id
      union select file_id from public.work_order_signatures where work_order_id = p_entity_id and file_id is not null
      union select cp.file_id from public.check_photos cp join public.checks ch on ch.id = cp.check_id where ch.work_order_id = p_entity_id
      union select d.photo_file_id from public.deficiencies d where d.id = any(v_deficiency_ids)
    ) purga_files where purga_files.file_id is not null;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]'::jsonb) into v_file_snapshot from public.files where id = any(v_file_ids);
    delete from public.work_order_quote_line_decisions where work_order_id = p_entity_id;
    delete from public.work_order_cost_entries where work_order_id = p_entity_id;
    delete from public.work_order_planned_material_decisions where work_order_id = p_entity_id;
    delete from public.corrective_actions where deficiency_id = any(v_deficiency_ids);
    delete from public.deficiencies where id = any(v_deficiency_ids);
    delete from public.alerts where related_entity = 'deficiencies' and related_id = any(v_deficiency_ids);
    delete from public.check_item_results where check_id in (select id from public.checks where work_order_id = p_entity_id);
    delete from public.check_section_results where check_id in (select id from public.checks where work_order_id = p_entity_id);
    delete from public.check_photos where check_id in (select id from public.checks where work_order_id = p_entity_id);
    delete from public.checks where work_order_id = p_entity_id;
    delete from public.work_order_time_entries where work_order_id = p_entity_id;
    delete from public.work_order_materials where work_order_id = p_entity_id;
    delete from public.work_order_notes where work_order_id = p_entity_id;
    delete from public.work_order_photos where work_order_id = p_entity_id;
    delete from public.work_order_signatures where work_order_id = p_entity_id;
    delete from public.work_order_assignments where work_order_id = p_entity_id;
    delete from public.work_order_equipment where work_order_id = p_entity_id;
    delete from public.work_order_status_history where work_order_id = p_entity_id;
    delete from public.alerts where related_entity = 'work_orders' and related_id = p_entity_id;
    delete from public.material_requests where work_order_id = p_entity_id;
    delete from public.case_links where related_type = 'Parte' and related_id = p_entity_id;
    update public.quotes set work_order_id = null where work_order_id = p_entity_id;
    v_queued_files := v_queued_files + public.dmp_queue_storage_cleanup(v_file_ids, v_actor.id, 'Purga de parte ' || v_code);
    delete from public.work_orders where id = p_entity_id;

  elsif p_entity = 'checks' then
    select 1 into v_exists from public.checks where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id;
    if exists (select 1 from public.deficiencies where check_id = p_entity_id) then raise exception 'purga: el check tiene deficiencias vinculadas. Resuelvelas antes de purgar.'; end if;
    select coalesce(array_agg(file_id), '{}') into v_file_ids from public.check_photos where check_id = p_entity_id and file_id is not null;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]'::jsonb) into v_file_snapshot from public.files where id = any(v_file_ids);
    delete from public.check_item_results where check_id = p_entity_id;
    delete from public.check_section_results where check_id = p_entity_id;
    delete from public.check_photos where check_id = p_entity_id;
    delete from public.case_links where related_type = 'Check' and related_id = p_entity_id;
    delete from public.alerts where related_entity = 'checks' and related_id = p_entity_id;
    v_queued_files := public.dmp_queue_storage_cleanup(v_file_ids, v_actor.id, 'Purga de check ' || v_code);
    delete from public.checks where id = p_entity_id;

  elsif p_entity = 'quotes' then
    select 1 into v_exists from public.quotes where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.quotes t where id = p_entity_id;
    if exists (select 1 from public.deficiencies where origin_quote_id = p_entity_id) then raise exception 'purga: el presupuesto tiene deficiencias originadas. Resuelvelas antes de purgar.'; end if;
    select count(*) into v_count from public.work_orders where quote_id = p_entity_id;
    if v_count > 0 and not v_purge_wo then raise exception 'purga: el presupuesto tiene partes generados (% ). Usa scope.purge_related_work_orders.enable para purgarlos en cascada.', v_count; end if;
    for v_wo in select * from public.work_orders where quote_id = p_entity_id order by id loop
      v_wo_code := coalesce((select code from public.work_orders where id = v_wo.id), v_wo.id::text);
      perform public.dmp_purge_entity_with_cleanup('work_orders', v_wo.id, p_reason, 'ELIMINAR ' || v_wo_code, jsonb_build_object('purge_related_work_orders', true), p_return_stock, false);
    end loop;
    delete from public.work_order_quote_line_decisions where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id);
    delete from public.work_order_planned_material_decisions where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id);
    delete from public.work_order_cost_entries where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id);
    delete from public.quote_status_history where quote_id = p_entity_id;
    delete from public.quote_lines where quote_id = p_entity_id;
    delete from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id;
    delete from public.quotes where id = p_entity_id;

  elsif p_entity = 'materials' then
    select * into v_material from public.materials where id = p_entity_id for update;
    if v_material.id is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select count(*) into v_count from public.work_order_materials where material_id = p_entity_id;
    if v_count > 0 and not v_force then raise exception 'purga: el material % tiene usos en partes. Usa scope.force.enable para desvincularlos.', v_material.code; end if;
    select count(*) into v_count from public.quote_lines where material_id = p_entity_id;
    if v_count > 0 and not v_force then raise exception 'purga: el material % aparece en lineas de presupuesto. Usa scope.force.enable para desvincularlas.', v_material.code; end if;
    select count(*) into v_count from public.warehouse_stock where material_id = p_entity_id;
    if v_count > 0 and not v_force then raise exception 'purga: el material % tiene existencias de almacen. Usa scope.force.enable.', v_material.code; end if;
    select count(*) into v_count from public.stock_movements where material_id = p_entity_id;
    if v_count > 0 and not v_force then raise exception 'purga: el material % tiene movimientos de stock. Usa scope.force.enable.', v_material.code; end if;
    if v_force then
      update public.work_order_materials set material_id = null, stock_deducted_quantity = 0 where material_id = p_entity_id;
      update public.quote_lines set material_id = null where material_id = p_entity_id;
      delete from public.warehouse_stock where material_id = p_entity_id;
      delete from public.stock_movements where material_id = p_entity_id;
    end if;
    v_old := to_jsonb(v_material);
    delete from public.materials where id = p_entity_id;

  elsif p_entity = 'equipment' then
    select 1 into v_exists from public.equipment where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id;
    select count(*) into v_num from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is not null;
    if v_num > 0 then raise exception 'purga: hay % partes archivados que referencian el equipo. No se puede purgar.', v_num; end if;
    select count(*) into v_count from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is null;
    if v_count > 0 and not v_purge_wo then raise exception 'purga: el equipo tiene partes asociados (% ). Usa scope.purge_related_work_orders.enable para purgarlos.', v_count; end if;
    for v_wo in select distinct w.* from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is null order by w.id loop
      v_wo_code := coalesce((select code from public.work_orders where id = v_wo.id), v_wo.id::text);
      perform public.dmp_purge_entity_with_cleanup('work_orders', v_wo.id, p_reason, 'ELIMINAR ' || v_wo_code, jsonb_build_object('purge_related_work_orders', true), p_return_stock, false);
    end loop;
    if exists (select 1 from public.document_links where related_type = 'Equipo' and related_id = p_entity_id) then v_queued_files := v_queued_files + public.dmp_purge_document_links('Equipo', p_entity_id, v_doc_mode, v_actor.id, p_reason); end if;
    for v_child in select * from public.checks where equipment_id = p_entity_id and work_order_id is null order by id loop
      v_wo_code := coalesce((select code from public.checks where id = v_child.id), v_child.id::text);
      perform public.dmp_purge_entity_with_cleanup('checks', v_child.id, p_reason, 'ELIMINAR ' || v_wo_code, p_scope, p_return_stock, false);
    end loop;
    select count(*) into v_count from public.deficiencies where equipment_id = p_entity_id;
    if v_count > 0 and not v_force then raise exception 'purga: el equipo tiene deficiencias registradas (% ). Usa scope.force.enable para purgarlas.', v_count; end if;
    if v_force and v_count > 0 then
      select coalesce(array_agg(id), '{}') into v_deficiency_ids from public.deficiencies where equipment_id = p_entity_id;
      if public.dmp_deficiency_blocking_reference_count(v_deficiency_ids) > 0 then raise exception 'purga: hay referencias externas hacia deficiencias del equipo. No se puede purgar.'; end if;
      delete from public.corrective_actions where deficiency_id = any(v_deficiency_ids);
      delete from public.case_links where related_type = 'Incidencia' and related_id = any(v_deficiency_ids);
      v_file_ids := v_file_ids || (select coalesce(array_agg(photo_file_id), '{}') from public.deficiencies where id = any(v_deficiency_ids) and photo_file_id is not null);
      delete from public.deficiencies where id = any(v_deficiency_ids);
      delete from public.alerts where related_entity = 'deficiencies' and related_id = any(v_deficiency_ids);
    end if;
    v_file_ids := v_file_ids || (select coalesce(array_agg(file_id), '{}') from public.equipment_photos where equipment_id = p_entity_id and file_id is not null);
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]'::jsonb) into v_file_snapshot from public.files where id = any(v_file_ids);
    delete from public.equipment_status_history where equipment_id = p_entity_id;
    delete from public.equipment_components where equipment_id = p_entity_id;
    delete from public.equipment_photos where equipment_id = p_entity_id;
    delete from public.alerts where related_entity = 'equipment' and related_id = p_entity_id;
    delete from public.case_links where related_type = 'Equipo' and related_id = p_entity_id;
    update public.quotes set equipment_id = null where equipment_id = p_entity_id;
    update public.opportunities set source_related_type = null, source_related_id = null where source_related_type = 'Equipo' and source_related_id = p_entity_id;
    v_queued_files := v_queued_files + public.dmp_queue_storage_cleanup(v_file_ids, v_actor.id, 'Purga de equipo ' || v_code);
    delete from public.equipment where id = p_entity_id;

  elsif p_entity = 'cases' then
    select 1 into v_exists from public.cases where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id;
    if exists (select 1 from public.document_links where related_type = 'Expediente' and related_id = p_entity_id) then v_queued_files := v_queued_files + public.dmp_purge_document_links('Expediente', p_entity_id, v_doc_mode, v_actor.id, p_reason); end if;
    if not v_purge_wo and (select count(*) from public.work_orders where case_id = p_entity_id) > 0 then raise exception 'purga: el expediente tiene partes asociados. Usa scope.purge_related_work_orders.enable.'; end if;
    for v_wo in select * from public.work_orders where case_id = p_entity_id order by id loop
      v_wo_code := coalesce((select code from public.work_orders where id = v_wo.id), v_wo.id::text);
      perform public.dmp_purge_entity_with_cleanup('work_orders', v_wo.id, p_reason, 'ELIMINAR ' || v_wo_code, jsonb_build_object('purge_related_work_orders', true), p_return_stock, false);
    end loop;
    for v_quote in select * from public.quotes where case_id = p_entity_id order by id loop
      v_quote_code := coalesce((select code from public.quotes where id = v_quote.id), v_quote.id::text);
      perform public.dmp_purge_entity_with_cleanup('quotes', v_quote.id, p_reason, 'ELIMINAR ' || v_quote_code, jsonb_build_object('purge_related_work_orders', true), p_return_stock, false);
    end loop;
    for v_child in select * from public.opportunities where case_id = p_entity_id order by id loop
      v_quote_code := coalesce((select code from public.opportunities where id = v_child.id), v_child.id::text);
      perform public.dmp_purge_entity_with_cleanup('opportunities', v_child.id, p_reason, 'ELIMINAR ' || v_quote_code, p_scope, p_return_stock, false);
    end loop;
    select coalesce(array_agg(file_id), '{}') into v_file_ids from public.case_documents where case_id = p_entity_id and file_id is not null;
    delete from public.case_documents where case_id = p_entity_id;
    delete from public.case_events where case_id = p_entity_id;
    delete from public.case_links where case_id = p_entity_id;
    delete from public.alerts where related_entity = 'cases' and related_id = p_entity_id;
    v_queued_files := v_queued_files + public.dmp_queue_storage_cleanup(v_file_ids, v_actor.id, 'Purga de expediente ' || v_code);
    delete from public.cases where id = p_entity_id;

  elsif p_entity = 'documents' then
    select 1 into v_exists from public.documents where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.documents t where id = p_entity_id;
    select coalesce(array_agg(file_id), '{}') into v_file_ids from public.documents where id = p_entity_id and file_id is not null;
    delete from public.document_links where document_id = p_entity_id;
    v_queued_files := public.dmp_queue_storage_cleanup(v_file_ids, v_actor.id, 'Purga de documento ' || v_code);
    delete from public.documents where id = p_entity_id;

  elsif p_entity = 'alerts' then
    select 1 into v_exists from public.alerts where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.alerts t where id = p_entity_id;
    if exists (select 1 from public.deficiencies where origin_alert_id = p_entity_id) then raise exception 'purga: el aviso tiene incidencias originadas. Resuelvelas antes de purgar.'; end if;
    delete from public.alert_recipients where alert_id = p_entity_id;
    delete from public.case_links where related_type = 'Aviso' and related_id = p_entity_id;
    delete from public.alerts where id = p_entity_id;

  elsif p_entity = 'opportunities' then
    select 1 into v_exists from public.opportunities where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.opportunities t where id = p_entity_id;
    if exists (select 1 from public.deficiencies where origin_opportunity_id = p_entity_id) then raise exception 'purga: la oportunidad tiene incidencias originadas. Resuelvelas antes de purgar.'; end if;
    select count(*) into v_num from public.quotes where opportunity_id = p_entity_id;
    if v_num > 0 then raise exception 'purga: la oportunidad tiene % presupuestos vinculados. No se borran en cascada: purga cada presupuesto con su propia purga antes de borrar la oportunidad.', v_num; end if;
    delete from public.case_links where related_type = 'Oportunidad' and related_id = p_entity_id;
    delete from public.opportunities where id = p_entity_id;

  elsif p_entity = 'equipment_components' then
    select 1 into v_exists from public.equipment_components where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.equipment_components t where id = p_entity_id;
    delete from public.equipment_components where id = p_entity_id;

  elsif p_entity in ('clients','sites','check_templates') then
    if coalesce((v_deps->>'can_permanently_delete')::boolean, false) is not true then raise exception 'purga: %', coalesce(v_deps->>'physical_delete_blocker', 'El registro tiene dependencias y no puede borrarse definitivamente'); end if;
    if p_entity = 'clients' then
      select 1 into v_exists from public.clients where id = p_entity_id for update;
      if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
      select to_jsonb(t) into v_old from public.clients t where id = p_entity_id;
      delete from public.alerts where related_entity = 'clients' and related_id = p_entity_id;
      delete from public.clients where id = p_entity_id;
    elsif p_entity = 'sites' then
      select 1 into v_exists from public.sites where id = p_entity_id for update;
      if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
      select to_jsonb(t) into v_old from public.sites t where id = p_entity_id;
      delete from public.alerts where related_entity = 'sites' and related_id = p_entity_id;
      delete from public.sites where id = p_entity_id;
    else
      select 1 into v_exists from public.check_templates where id = p_entity_id for update;
      if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
      select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id;
      delete from public.check_templates where id = p_entity_id;
    end if;
  else
    raise exception 'purga: entidad no soportada para purga definitiva: %', p_entity;
  end if;

  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old, jsonb_build_object('reason', p_reason, 'code', v_code, 'dependency_summary', v_deps, 'delete_plan', v_plan, 'stock_returned', p_return_stock, 'stock_refund_units', v_refunded, 'storage_files_queued', v_queued_files, 'file_snapshot', v_file_snapshot, 'scope', p_scope, 'deleted_at', now()));
  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, v_actor.id, 'eliminacion definitiva', p_entity, p_entity_id, 'Registro purgado definitivamente (datos de prueba)', jsonb_build_object('reason', p_reason, 'code', v_code, 'scope', p_scope, 'stock_returned', p_return_stock, 'stock_refund_units', v_refunded, 'storage_cleanup_queued', v_queued_files));
  return jsonb_build_object('operation', 'purged', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'company_id', v_company_id, 'reason', p_reason, 'stock_refund_units', v_refunded, 'storage_files_queued', v_queued_files);
end;
$$;

create or replace function public.dmp_purge_entity_with_cleanup(
  p_entity text,
  p_entity_id uuid,
  p_reason text,
  p_confirmation text,
  p_scope jsonb default '{}'::jsonb,
  p_return_stock boolean default true,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_material public.materials;
  v_stock public.warehouse_stock;
  v_code text;
begin
  if p_entity <> 'materials' then
    return public.dmp_purge_entity_with_cleanup_legacy(p_entity, p_entity_id, p_reason, p_confirmation, p_scope, p_return_stock, p_dry_run);
  end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'purga: el motivo es obligatorio'; end if;
  if not public.is_platform_superadmin() then raise exception 'purga: solo el propietario global puede ejecutar purgas definitivas'; end if;
  v_actor := public.dmp_assert_lifecycle_actor(public.current_company_id());
  select * into v_material from public.materials where id = p_entity_id for update;
  if v_material.id is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'dry_run', p_dry_run); end if;
  v_code := v_material.code;
  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then raise exception 'purga: confirmacion incorrecta. Escribe ELIMINAR %', v_code; end if;
  if p_dry_run then return jsonb_build_object('operation', 'dry_run', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', true); end if;
  if exists (select 1 from public.warehouse_stock where material_id = p_entity_id and quantity > 0) then raise exception 'purga: el material % tiene stock canonico activo', v_code; end if;
  if exists (select 1 from public.work_order_materials where material_id = p_entity_id) then raise exception 'purga: el material % tiene usos en partes', v_code; end if;
  if exists (select 1 from public.quote_lines where material_id = p_entity_id) then raise exception 'purga: el material % aparece en presupuestos', v_code; end if;
  delete from public.warehouse_stock where material_id = p_entity_id;
  delete from public.stock_movements where material_id = p_entity_id;
  delete from public.materials where id = p_entity_id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_material.company_id, 'materials', p_entity_id, 'DELETE', v_actor.id, to_jsonb(v_material), jsonb_build_object('reason', p_reason, 'canonical_stock_purged', true));
  return jsonb_build_object('operation', 'purged', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'company_id', v_material.company_id, 'stock_refund_units', 0);
end;
$$;

grant execute on function public.dmp_lifecycle_dependencies(text, uuid) to authenticated;
grant execute on function public.dmp_lifecycle_delete_plan(text, uuid) to authenticated;
revoke all on function public.dmp_purge_entity_with_cleanup_legacy(text, uuid, text, text, jsonb, boolean, boolean) from public, anon, authenticated;

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(to_regprocedure('public.dmp_lifecycle_dependencies(text,uuid)'));
  if position('material_stock_movements' in lower(v_definition)) > 0 then raise exception '110: lifecycle_dependencies conserva referencia legacy'; end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)'));
  if position('material_stock_movements' in lower(v_definition)) > 0 then raise exception '110: lifecycle_delete_plan conserva referencia legacy'; end if;
  if position('movimientos_stock_nuevos' in lower(v_definition)) > 0 then raise exception '110: lifecycle_delete_plan conserva metrica duplicada'; end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)'));
  if position('material_stock_movements' in lower(v_definition)) > 0 then raise exception '110: purge_legacy conserva referencia legacy'; end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)') is not null then
    v_definition := pg_get_functiondef(to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)'));
    if position('material_stock_movements' in lower(v_definition)) > 0 then raise exception '110: purge_wrapper conserva referencia legacy'; end if;
  end if;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.material_stock_movements;
  if v_count <> 0 then raise exception '110: material_stock_movements no esta vacia: % filas', v_count; end if;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prokind in ('f', 'p')
    and position('material_stock_movements' in lower(pg_get_functiondef(p.oid))) > 0;
  if v_count <> 0 then raise exception '110: quedan % funciones runtime con material_stock_movements', v_count; end if;
end;
$$;

revoke all on table public.material_stock_movements from public, anon, authenticated;
drop policy if exists material_stock_movements_select_scoped on public.material_stock_movements;
drop policy if exists material_stock_movements_insert_block_direct on public.material_stock_movements;
drop policy if exists material_stock_movements_update_block_direct on public.material_stock_movements;
drop policy if exists material_stock_movements_delete_block_direct on public.material_stock_movements;
drop policy if exists material_stock_movements_platform_superadmin_select on public.material_stock_movements;

drop table public.material_stock_movements;

commit;
