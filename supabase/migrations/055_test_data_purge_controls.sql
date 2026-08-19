-- DoorManager Pro - purga segura de datos de prueba (solo propietario global).
-- Idempotente. Mantiene RLS y company_id. Sin DROP CASCADE, sin desactivar RLS,
-- sin permisos a anon/public y sin borrar datos existentes fuera de la purga.
--
-- Alcance (aprobado):
--   1. dmp_purge_entity_with_cleanup: purga fisica ordenada por entidad con dry-run,
--      devolucion real de stock (p_return_stock default true) y un unico evento final
--      de auditoria. Ejecutable solo por public.is_platform_superadmin() (017).
--   2. Variante batch dmp_purge_test_batch: purga en lote por empresa para superadmin.
--   3. Borrado clasico 1-a-1 (dmp_permanently_delete_entity de 022/023) sin cambios:
--      SAT/Gerencia conservan archivo y borrado clasico.
--   4. Regla dura de stock: UNA unica fuente de devolucion por consumo.
--      stock_deducted_quantity (work_order_materials) es la fuente autoritativa y se
--      devuelve exactamente una vez via dmp_refund_work_order_material_stock.
--      Los material_stock_movements son trazabilidad del efecto, no una orden de
--      devolucion: los ligados a un uso se ignoran en la rama quote y los movimientos
--      de quote sin uso asociado bloquean la purga si p_return_stock=true.
--   5. Correccion del check de activity_log.action (001) para incluir
--      'eliminacion definitiva' (activity_log_operation_check en 048 no lo bloquea);
--      esto ademas repara el bug latente de 023:510 (insertaba 'eliminacion definitiva'
--      contra un CHECK que lo rechazaba).
--   6. dmp_lifecycle_dependencies/delete_plan ampliados con las ramas
--      quotes/materials/documents/alerts/opportunities/equipment_components y los
--      FKs posteriores (material_stock_movements, work_order_cost_entries,
--      decisions 046/047, quotes.work_order_id, work_orders.quote_id,
--      deficiencies.origin_quote_id). Bloqueos por FK NO ACTION sin tocar CHECKs
--      historicos: opportunities con quotes vinculadas y equipment con partes
--      archivados SIEMPRE se bloquean antes de ejecutar cualquier DELETE.
--   7. Idempotencia: pg_advisory_xact_lock por clave, y comprobacion de existencia de
--      la raiz tras el lock; raiz inexistente devuelve already_deleted sin crear
--      audit_log/activity_log ni ejecutar cascadas. El batch deduplica entity+id.

begin;

-- ============================================================
-- 1) activity_log.action: habilitar 'eliminacion definitiva'
-- ============================================================
alter table public.activity_log drop constraint if exists activity_log_action_check;
alter table public.activity_log add constraint activity_log_action_check
  check (action in ('creacion','modificacion','eliminacion logica','eliminacion definitiva','cambio de estado','asignacion','cierre','reapertura'));

-- ============================================================
-- 2) dmp_lifecycle_dependencies: amplia 052 (materiales) con las ramas
--    quotes, equipment_components, documents, alerts, opportunities y con los
--    FKs posteriores en work_orders / equipment / checks / quotes.
-- ============================================================
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
      'recursos_costes', (select count(*) from public.work_order_cost_entries where work_order_id = p_entity_id),
      'decisiones_materiales_previstos', (select count(*) from public.work_order_planned_material_decisions where work_order_id = p_entity_id),
      'decisiones_conceptos_previstos', (select count(*) from public.work_order_quote_line_decisions where work_order_id = p_entity_id),
      'fotos', (select count(*) from public.work_order_photos where work_order_id = p_entity_id),
      'firmas', (select count(*) from public.work_order_signatures where work_order_id = p_entity_id),
      'checks', (select count(*) from public.checks where work_order_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where work_order_id = p_entity_id or origin_work_order_id = p_entity_id),
      'avisos', (select count(*) from public.alerts where related_entity = 'work_orders' and related_id = p_entity_id),
      'movimientos de stock', (select count(*) from public.material_stock_movements where work_order_id = p_entity_id),
      'presupuestos vinculados', (select count(*) from public.quotes where work_order_id = p_entity_id),
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
      'movimientos de stock', (select count(*) from public.material_stock_movements where material_id = p_entity_id),
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
      'movimientos de stock', (select count(*) from public.material_stock_movements where quote_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where origin_quote_id = p_entity_id),
      'vinculos', (select count(*) from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id)
    );
  elsif p_entity = 'equipment_components' then
    select coalesce(deleted_at is not null, false), coalesce(serial_number, component_type), coalesce(nullif(brand || ' ' || model, ' '), serial_number, component_type) into v_archived, v_code, v_name from public.equipment_components where id = p_entity_id;
    v_counts := jsonb_build_object();
  elsif p_entity = 'documents' then
    select coalesce(deleted_at is not null or valid = false, false), title, title into v_archived, v_code, v_name from public.documents where id = p_entity_id;
    v_counts := jsonb_build_object(
      'vinculos', (select count(*) from public.document_links where document_id = p_entity_id)
    );
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

-- ============================================================
-- 3) dmp_lifecycle_delete_plan: amplia 023 (work_orders) con los recursos y
--    decisiones de coste, nuevos movimientos de stock y presupuestos vinculados.
-- ============================================================
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
      'presupuestos_vinculados', (select count(*) from public.quotes where work_order_id = p_entity_id),
      'movimientos_stock_nuevos', (select count(*) from public.material_stock_movements where work_order_id = p_entity_id)
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
    -- FK fisicas reales hacia equipment: partes activos y archivados (main_equipment_id
    -- y work_order_equipment.equipment_id). Los archivados SIEMPRE bloquean la purga
    -- (no se anula el FK ni se borran partes archivados).
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
    -- quotes.opportunity_id es FK NO ACTION: el presupuesto se purga por su propia
    -- ruta, nunca en cascada desde la oportunidad.
    v_blocking := jsonb_build_object(
      'presupuestos', (select count(*) from public.quotes where opportunity_id = p_entity_id),
      'vinculos_de_incidencia', (select count(*) from public.deficiencies where origin_opportunity_id = p_entity_id)
    );
  elsif p_entity = 'quotes' then
    v_cascade := jsonb_build_object(
      'lineas', (select count(*) from public.quote_lines where quote_id = p_entity_id),
      'historial', (select count(*) from public.quote_status_history where quote_id = p_entity_id),
      'movimientos_stock', (select count(*) from public.material_stock_movements where quote_id = p_entity_id),
      'vinculos', (select count(*) from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id)
    );
    v_blocking := jsonb_build_object(
      'partes_generados', (select count(*) from public.work_orders where quote_id = p_entity_id),
      'deficiencias', (select count(*) from public.deficiencies where origin_quote_id = p_entity_id)
    );
  elsif p_entity = 'materials' then
    v_blocking := jsonb_build_object(
      'usos_en_partes', (select count(*) from public.work_order_materials where material_id = p_entity_id),
      'movimientos_stock', (select count(*) from public.material_stock_movements where material_id = p_entity_id),
      'lineas_presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id),
      'existencias', (select count(*) from public.warehouse_stock where material_id = p_entity_id),
      'stock_activo', case when coalesce((select stock_quantity from public.materials where id = p_entity_id), 0) > 0 then 1 else 0 end
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
    -- Bloqueados por la capa base (dmp_lifecycle_dependencies.can_permanently_delete):
    -- cualquier dependencia impide la purga fisica de estas entidades.
    v_blocking := jsonb_build_object('dependencias', 1);
  end if;
  select coalesce(sum(value::text::integer), 0) = 0 into v_can from jsonb_each(v_blocking);
  return jsonb_build_object('can_controlled_cascade_delete', p_entity in ('work_orders','checks') and v_can, 'cascade_dependencies', v_cascade, 'blocking_dependencies', v_blocking);
end;
$$;

-- ============================================================
-- 4) Helper de documentos vinculados: block (por defecto), purge o detach.
--    Devuelve el numero de ficheros encolados para limpieza de storage.
-- ============================================================
create or replace function public.dmp_purge_document_links(p_related_type text, p_related_id uuid, p_mode text, p_actor_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_ids uuid[];
  v_queued integer := 0;
begin
  if p_mode not in ('block','purge','detach') then
    raise exception 'purga: modo de documentos no valido (block|purge|detach)';
  end if;
  if p_mode = 'block' then
    if exists (select 1 from public.document_links where related_type = p_related_type and related_id = p_related_id) then
      raise exception 'purga: hay documentos vinculados (%). Resuelve los vinculos o usa scope.documents.enable', p_related_type;
    end if;
    return 0;
  end if;
  select coalesce(array_agg(document_id), '{}') into v_doc_ids
  from public.document_links where related_type = p_related_type and related_id = p_related_id;
  if coalesce(array_length(v_doc_ids, 1), 0) = 0 then return 0; end if;
  if p_mode = 'detach' then
    update public.document_links set related_id = null where related_type = p_related_type and related_id = p_related_id;
    return 0;
  end if;
  delete from public.document_links where related_type = p_related_type and related_id = p_related_id;
  v_queued := public.dmp_queue_storage_cleanup(
    (select coalesce(array_agg(file_id), '{}') from public.documents where id = any(v_doc_ids) and file_id is not null),
    p_actor_id, p_reason);
  delete from public.documents where id = any(v_doc_ids);
  return v_queued;
end;
$$;

-- ============================================================
-- 5) Helper de devolucion real de stock de un consumo de parte.
--    Solo actua si el material sigue activo y controla stock; recalcula stock
--    via dmp_apply_material_stock_movement (052) y vacia stock_deducted_quantity.
-- ============================================================
create or replace function public.dmp_refund_work_order_material_stock(p_usage_id uuid, p_actor_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.work_order_materials;
  v_material public.materials;
begin
  if p_usage_id is null or p_actor_id is null then return; end if;
  select * into v_usage from public.work_order_materials where id = p_usage_id for share;
  if v_usage.id is null or v_usage.material_id is null or coalesce(v_usage.stock_deducted_quantity, 0) <= 0 then return; end if;
  select * into v_material from public.materials where id = v_usage.material_id and deleted_at is null;
  if v_material.id is null or not v_material.stock_controlled then return; end if;
  perform public.dmp_apply_material_stock_movement(
    v_usage.material_id, 'return', v_usage.stock_deducted_quantity,
    p_reason, 'work_order', v_usage.work_order_id, v_usage.id, null, v_usage.unit_price, p_actor_id);
  update public.work_order_materials set stock_deducted_quantity = 0, updated_at = now() where id = v_usage.id;
end;
$$;

-- ============================================================
-- 6) Motor de purga: dmp_purge_entity_with_cleanup.
--    Solo public.is_platform_superadmin(). p_dry_run solo presenta el plan.
--    p_scope: { force, purge_related_work_orders, documents, stock_movements }.
--    p_return_stock (default true): devuelve stock real antes de borrar.
-- ============================================================
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
  v_mov record;
  v_wo public.work_orders;
  v_wo_code text;
  v_child record;
  v_quote public.quotes;
  v_quote_code text;
  v_count integer;
  v_exists integer;
  v_num integer;
  v_new numeric;
  v_material public.materials;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'purga: el motivo es obligatorio'; end if;
  if not public.is_platform_superadmin() then
    raise exception 'purga: solo el propietario global puede ejecutar purgas definitivas. SAT, Gerencia y Oficina conservan el archivo y el borrado clasico.';
  end if;
  if p_entity = 'profiles' then
    raise exception 'purga: las cuentas Auth no se eliminan desde la aplicacion';
  end if;

  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);
  v_deps := public.dmp_lifecycle_dependencies(p_entity, p_entity_id);
  v_plan := public.dmp_lifecycle_delete_plan(p_entity, p_entity_id);
  v_code := coalesce(v_deps->>'code', p_entity_id::text);

  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then
    raise exception 'purga: confirmacion incorrecta. Escribe ELIMINAR %', v_code;
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'operation', 'dry_run', 'entity', p_entity, 'id', p_entity_id, 'code', v_code,
      'company_id', v_company_id, 'dry_run', true,
      'plan', v_deps || v_plan,
      'message', 'No se ha modificado nada. Repite la llamada con dry_run=false para purgar.'
    );
  end if;

  -- Serializa purgas concurrentes sobre la misma raiz: el segundo superadmin espera
  -- y al entrar encuentra la raiz ya borrada -> already_deleted, sin segundo evento.
  perform pg_advisory_xact_lock(hashtext('dmp_purge:' || p_entity || ':' || p_entity_id::text));

  if p_entity = 'work_orders' then
    select 1 into v_exists from public.work_orders where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id;

    -- Bloqueos duros de borrado clasico que la purga respeta salvo override explicito.
    if exists (select 1 from public.document_links where related_type = 'Parte' and related_id = p_entity_id) then
      v_queued_files := v_queued_files + public.dmp_purge_document_links('Parte', p_entity_id, v_doc_mode, v_actor.id, p_reason);
    end if;
    if exists (select 1 from public.stock_movements where work_order_id = p_entity_id) then
      if v_stock_mode <> 'purge' then
        raise exception 'purga: hay movimientos de stock historicos vinculados al parte. Usa scope.stock_movements.enable para purgarlos.';
      end if;
      delete from public.stock_movements where work_order_id = p_entity_id;
    end if;
    if exists (select 1 from public.deficiencies where origin_work_order_id = p_entity_id and work_order_id is distinct from p_entity_id) then
      raise exception 'purga: hay deficiencias externas vinculadas a este parte. Resuelve esos vinculos antes de purgar.';
    end if;
    select coalesce(array_agg(id), '{}') into v_deficiency_ids
    from public.deficiencies
    where work_order_id = p_entity_id or check_id in (select id from public.checks where work_order_id = p_entity_id);
    if public.dmp_deficiency_blocking_reference_count(v_deficiency_ids) > 0 then
      raise exception 'purga: hay referencias no clasificadas hacia deficiencias del parte. No se puede purgar definitivamente.';
    end if;

    -- Devolucion real de stock antes de borrar usos y movimientos.
    if p_return_stock then
      for v_usage in select * from public.work_order_materials where work_order_id = p_entity_id loop
        perform public.dmp_refund_work_order_material_stock(v_usage.id, v_actor.id, p_reason);
        v_refunded := v_refunded + coalesce(v_usage.stock_deducted_quantity, 0);
      end loop;
    end if;

    -- Ficheros que se liberan (fotos, firmas, fotografias de checks, fotos de deficiencias).
    select coalesce(array_agg(file_id), '{}') into v_file_ids from (
      select file_id from public.work_order_photos where work_order_id = p_entity_id
      union select file_id from public.work_order_signatures where work_order_id = p_entity_id and file_id is not null
      union select cp.file_id from public.check_photos cp join public.checks ch on ch.id = cp.check_id where ch.work_order_id = p_entity_id
      union select d.photo_file_id from public.deficiencies d where d.id = any(v_deficiency_ids)
    ) purga_files where purga_files.file_id is not null;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]'::jsonb)
      into v_file_snapshot from public.files where id = any(v_file_ids);

    -- Precios de coste y decisiones que referencian lineas de presupuesto antes que ellas.
    delete from public.work_order_quote_line_decisions where work_order_id = p_entity_id;
    delete from public.work_order_cost_entries where work_order_id = p_entity_id;
    delete from public.work_order_planned_material_decisions where work_order_id = p_entity_id;
    -- Movimientos de stock del parte (incluidos los generados por la devolucion).
    delete from public.material_stock_movements where work_order_id = p_entity_id;
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
    if exists (select 1 from public.deficiencies where check_id = p_entity_id) then
      raise exception 'purga: el check tiene deficiencias vinculadas. Resuelvelas antes de purgar.';
    end if;
    select coalesce(array_agg(file_id), '{}') into v_file_ids from public.check_photos where check_id = p_entity_id and file_id is not null;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]'::jsonb)
      into v_file_snapshot from public.files where id = any(v_file_ids);
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
    if exists (select 1 from public.deficiencies where origin_quote_id = p_entity_id) then
      raise exception 'purga: el presupuesto tiene deficiencias originadas. Resuelvelas antes de purgar.';
    end if;

    -- Partes generados desde este presupuesto: bloquean por defecto; con flag se purgan.
    select count(*) into v_count from public.work_orders where quote_id = p_entity_id;
    if v_count > 0 and not v_purge_wo then
      raise exception 'purga: el presupuesto tiene partes generados (% ). Usa scope.purge_related_work_orders.enable para purgarlos en cascada.', v_count;
    end if;
    for v_wo in select * from public.work_orders where quote_id = p_entity_id order by id loop
      v_wo_code := coalesce((select code from public.work_orders where id = v_wo.id), v_wo.id::text);
      perform public.dmp_purge_entity_with_cleanup('work_orders', v_wo.id, p_reason, 'ELIMINAR ' || v_wo_code,
                                                   jsonb_build_object('purge_related_work_orders', true),
                                                   p_return_stock, false);
    end loop;

    -- Movimientos de stock registrados sobre el presupuesto: regla de UNA devolucion.
    -- El consumo real de un parte se devuelve EXCLUSIVAMENTE a traves de
    -- dmp_refund_work_order_material_stock (stock_deducted_quantity es la fuente
    -- autoritativa). Los movimientos ligados a un uso (work_order_material_id) se
    -- ignoran aqui para no devolver dos veces el mismo tramo.
    delete from public.work_order_quote_line_decisions
      where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id);
    delete from public.work_order_planned_material_decisions
      where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id);
    delete from public.work_order_cost_entries
      where quote_line_id in (select id from public.quote_lines where quote_id = p_entity_id);
    for v_mov in select * from public.material_stock_movements where quote_id = p_entity_id loop
      if v_mov.work_order_material_id is not null then
        continue;
      end if;
      if p_return_stock then
        raise exception 'purga: hay movimientos de stock del presupuesto sin uso asociado. Semantica ambigua: no se puede reconciliar con seguridad. Purgalo con p_return_stock=false o revisa la trazabilidad previa.';
      end if;
    end loop;
    delete from public.material_stock_movements where quote_id = p_entity_id;
    delete from public.quote_status_history where quote_id = p_entity_id;
    delete from public.quote_lines where quote_id = p_entity_id;
    delete from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id;
    delete from public.quotes where id = p_entity_id;

  elsif p_entity = 'materials' then
    select * into v_material from public.materials where id = p_entity_id for update;
    if v_material.id is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    if coalesce(v_material.stock_quantity, 0) > 0 and not v_force then
      raise exception 'purga: el material % tiene stock activo. Ajusta el stock o usa scope.force.enable.', v_material.code;
    end if;
    select count(*) into v_count from public.work_order_materials where material_id = p_entity_id;
    if v_count > 0 and not v_force then
      raise exception 'purga: el material % tiene usos en partes. Usa scope.force.enable para desvincularlos.', v_material.code;
    end if;
    select count(*) into v_count from public.quote_lines where material_id = p_entity_id;
    if v_count > 0 and not v_force then
      raise exception 'purga: el material % aparece en lineas de presupuesto. Usa scope.force.enable para desvincularlas.', v_material.code;
    end if;
    select count(*) into v_count from public.material_stock_movements where material_id = p_entity_id;
    if v_count > 0 and not v_force then
      raise exception 'purga: el material % tiene movimientos de stock. Usa scope.force.enable para purgarlos.', v_material.code;
    end if;
    select count(*) into v_count
    from (select id from public.warehouse_stock where material_id = p_entity_id
          union select id from public.stock_movements where material_id = p_entity_id) almacen;
    if v_count > 0 and not v_force then
      raise exception 'purga: el material % tiene existencias de almacen historicas. Usa scope.force.enable para purgarlas.', v_material.code;
    end if;
    if v_force then
      update public.work_order_materials set material_id = null, stock_deducted_quantity = 0 where material_id = p_entity_id;
      update public.quote_lines set material_id = null where material_id = p_entity_id;
      delete from public.warehouse_stock where material_id = p_entity_id;
      delete from public.stock_movements where material_id = p_entity_id;
      delete from public.material_stock_movements where material_id = p_entity_id;
      update public.materials set stock_quantity = 0, last_stock_movement_at = now(), updated_at = now() where id = p_entity_id;
    end if;
    v_old := to_jsonb(v_material);
    delete from public.materials where id = p_entity_id;

  elsif p_entity = 'equipment' then
    select 1 into v_exists from public.equipment where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id;
    -- FK fisicas vivas: partes ACTIVOS y ARCHIVADOS (main_equipment_id y
    -- work_order_equipment.equipment_id). Un parte archivado bloquea SIEMPRE:
    -- 055 no anula FKs de historicos ni borra partes archivados.
    select count(*) into v_num
    from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id
    where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is not null;
    if v_num > 0 then
      raise exception 'purga: hay % partes archivados que referencian el equipo. No se puede purgar: no se anulan FKs de historicos ni se borran partes archivados.', v_num;
    end if;
    select count(*) into v_count
    from public.work_orders w left join public.work_order_equipment woe on woe.work_order_id = w.id
    where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is null;
    if v_count > 0 and not v_purge_wo then
      raise exception 'purga: el equipo tiene partes asociados (% ). Usa scope.purge_related_work_orders.enable para purgarlos.', v_count;
    end if;
    for v_wo in select distinct w.* from public.work_orders w
                left join public.work_order_equipment woe on woe.work_order_id = w.id
                where (w.main_equipment_id = p_entity_id or woe.equipment_id = p_entity_id) and w.deleted_at is null order by w.id loop
      v_wo_code := coalesce((select code from public.work_orders where id = v_wo.id), v_wo.id::text);
      perform public.dmp_purge_entity_with_cleanup('work_orders', v_wo.id, p_reason, 'ELIMINAR ' || v_wo_code,
                                                   jsonb_build_object('purge_related_work_orders', true),
                                                   p_return_stock, false);
    end loop;
    if exists (select 1 from public.document_links where related_type = 'Equipo' and related_id = p_entity_id) then
      v_queued_files := v_queued_files + public.dmp_purge_document_links('Equipo', p_entity_id, v_doc_mode, v_actor.id, p_reason);
    end if;
    -- Checks directos del equipo (sin parte).
    for v_child in select * from public.checks where equipment_id = p_entity_id and work_order_id is null order by id loop
      v_wo_code := coalesce((select code from public.checks where id = v_child.id), v_child.id::text);
      perform public.dmp_purge_entity_with_cleanup('checks', v_child.id, p_reason, 'ELIMINAR ' || v_wo_code,
                                                   p_scope, p_return_stock, false);
    end loop;
    -- Deficiencias del equipo: bloquean salvo override explicito.
    select count(*) into v_count from public.deficiencies where equipment_id = p_entity_id;
    if v_count > 0 and not v_force then
      raise exception 'purga: el equipo tiene deficiencias registradas (% ). Usa scope.force.enable para purgarlas.', v_count;
    end if;
    if v_force and v_count > 0 then
      select coalesce(array_agg(id), '{}') into v_deficiency_ids from public.deficiencies where equipment_id = p_entity_id;
      if public.dmp_deficiency_blocking_reference_count(v_deficiency_ids) > 0 then
        raise exception 'purga: hay referencias externas hacia deficiencias del equipo. No se puede purgar.';
      end if;
      delete from public.corrective_actions where deficiency_id = any(v_deficiency_ids);
      delete from public.case_links where related_type = 'Incidencia' and related_id = any(v_deficiency_ids);
      v_file_ids := v_file_ids || (select coalesce(array_agg(photo_file_id), '{}') from public.deficiencies where id = any(v_deficiency_ids) and photo_file_id is not null);
      delete from public.deficiencies where id = any(v_deficiency_ids);
      delete from public.alerts where related_entity = 'deficiencies' and related_id = any(v_deficiency_ids);
    end if;
    v_file_ids := v_file_ids
      || (select coalesce(array_agg(file_id), '{}') from public.equipment_photos where equipment_id = p_entity_id and file_id is not null);
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bucket', bucket, 'path', path)), '[]'::jsonb)
      into v_file_snapshot from public.files where id = any(v_file_ids);
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
    if exists (select 1 from public.document_links where related_type = 'Expediente' and related_id = p_entity_id) then
      v_queued_files := v_queued_files + public.dmp_purge_document_links('Expediente', p_entity_id, v_doc_mode, v_actor.id, p_reason);
    end if;
    if not v_purge_wo and (select count(*) from public.work_orders where case_id = p_entity_id) > 0 then
      raise exception 'purga: el expediente tiene partes asociados. Usa scope.purge_related_work_orders.enable.';
    end if;
    for v_wo in select * from public.work_orders where case_id = p_entity_id order by id loop
      v_wo_code := coalesce((select code from public.work_orders where id = v_wo.id), v_wo.id::text);
      perform public.dmp_purge_entity_with_cleanup('work_orders', v_wo.id, p_reason, 'ELIMINAR ' || v_wo_code,
                                                   jsonb_build_object('purge_related_work_orders', true),
                                                   p_return_stock, false);
    end loop;
    for v_quote in select * from public.quotes where case_id = p_entity_id order by id loop
      v_quote_code := coalesce((select code from public.quotes where id = v_quote.id), v_quote.id::text);
      perform public.dmp_purge_entity_with_cleanup('quotes', v_quote.id, p_reason, 'ELIMINAR ' || v_quote_code,
                                                   jsonb_build_object('purge_related_work_orders', true),
                                                   p_return_stock, false);
    end loop;
    for v_child in select * from public.opportunities where case_id = p_entity_id order by id loop
      v_quote_code := coalesce((select code from public.opportunities where id = v_child.id), v_child.id::text);
      perform public.dmp_purge_entity_with_cleanup('opportunities', v_child.id, p_reason, 'ELIMINAR ' || v_quote_code,
                                                   p_scope, p_return_stock, false);
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
    if exists (select 1 from public.deficiencies where origin_alert_id = p_entity_id) then
      raise exception 'purga: el aviso tiene incidencias originadas. Resuelvelas antes de purgar.';
    end if;
    delete from public.alert_recipients where alert_id = p_entity_id;
    delete from public.case_links where related_type = 'Aviso' and related_id = p_entity_id;
    delete from public.alerts where id = p_entity_id;

  elsif p_entity = 'opportunities' then
    select 1 into v_exists from public.opportunities where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.opportunities t where id = p_entity_id;
    if exists (select 1 from public.deficiencies where origin_opportunity_id = p_entity_id) then
      raise exception 'purga: la oportunidad tiene incidencias originadas. Resuelvelas antes de purgar.';
    end if;
    -- quotes.opportunity_id es FK NO ACTION: los presupuestos se purgan por su propia
    -- ruta, nunca en cascada desde la oportunidad. Sin quotes no hay bloqueo.
    select count(*) into v_num from public.quotes where opportunity_id = p_entity_id;
    if v_num > 0 then
      raise exception 'purga: la oportunidad tiene % presupuestos vinculados. No se borran en cascada: purga cada presupuesto con su propia purga antes de borrar la oportunidad.', v_num;
    end if;
    delete from public.case_links where related_type = 'Oportunidad' and related_id = p_entity_id;
    delete from public.opportunities where id = p_entity_id;

  elsif p_entity = 'equipment_components' then
    select 1 into v_exists from public.equipment_components where id = p_entity_id for update;
    if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
    select to_jsonb(t) into v_old from public.equipment_components t where id = p_entity_id;
    delete from public.equipment_components where id = p_entity_id;

  elsif p_entity in ('clients','sites','check_templates') then
    if coalesce((v_deps->>'can_permanently_delete')::boolean, false) is not true then
      raise exception 'purga: %', coalesce(v_deps->>'physical_delete_blocker', 'El registro tiene dependencias y no puede borrarse definitivamente');
    end if;
    if p_entity = 'clients' then
      select 1 into v_exists from public.clients where id = p_entity_id for update;
      if v_exists is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', false); end if;
      select to_jsonb(t) into v_old from public.clients t where id = p_entity_id;
      -- alerts usa related_entity 'clients' (convencion real del frontend).
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

  -- Unico evento final de auditoria: DELETE tecnico en audit_log y 'eliminacion definitiva'
  -- en activity_log (CHECK ampliado al inicio de esta migracion).
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_company_id, p_entity, p_entity_id, 'DELETE', v_actor.id, v_old,
          jsonb_build_object('reason', p_reason, 'code', v_code, 'dependency_summary', v_deps, 'delete_plan', v_plan,
                             'stock_returned', p_return_stock, 'stock_refund_units', v_refunded,
                             'storage_files_queued', v_queued_files, 'file_snapshot', v_file_snapshot,
                             'scope', v_scope, 'deleted_at', now()));
  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description, metadata)
  values (v_company_id, v_actor.id, 'eliminacion definitiva', p_entity, p_entity_id,
          'Registro purgado definitivamente (datos de prueba)',
          jsonb_build_object('reason', p_reason, 'code', v_code, 'scope', v_scope,
                             'stock_returned', p_return_stock, 'stock_refund_units', v_refunded,
                             'storage_cleanup_queued', v_queued_files));

  return jsonb_build_object(
    'operation', 'purged', 'entity', p_entity, 'id', p_entity_id, 'code', v_code,
    'company_id', v_company_id, 'reason', p_reason,
    'stock_refund_units', v_refunded, 'storage_files_queued', v_queued_files
  );
end;
$$;

-- ============================================================
-- 7) dmp_purge_test_batch: purga en lote por empresa (solo plataforma superadmin).
--    p_items: [{"entity":"work_orders","id":"<uuid>"}, ...]. La confirmacion
--    'ELIMINAR LOTE' solo se exige cuando dry_run es false.
-- ============================================================
create or replace function public.dmp_purge_test_batch(
  p_company_id uuid,
  p_items jsonb,
  p_reason text,
  p_confirmation text default 'ELIMINAR LOTE',
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_batch record;
  v_entity text;
  v_id uuid;
  v_target uuid;
  v_deps jsonb;
  v_code text;
  v_res jsonb;
  v_ok integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_done text[] := '{}';
begin
  if p_company_id is null then raise exception 'purga: falta la empresa de los datos de prueba'; end if;
  v_actor := public.dmp_assert_lifecycle_actor(p_company_id);
  if not public.is_platform_superadmin() then
    raise exception 'purga en lote: solo el propietario global puede purgar lotes de datos de prueba';
  end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'purga: no se han indicado registros a purgar';
  end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'purga: el motivo es obligatorio'; end if;
  if not p_dry_run and p_confirmation is distinct from 'ELIMINAR LOTE' then
    raise exception 'purga: confirmacion incorrecta. Escribe ELIMINAR LOTE';
  end if;

  for v_batch in select item, ord from jsonb_array_elements(p_items) with ordinality as t(item, ord) loop
    begin
      v_entity := v_batch.item->>'entity';
      v_id := nullif(v_batch.item->>'id', '')::uuid;
      if v_entity is null or v_id is null then raise exception 'purga: elemento sin entidad o id valido'; end if;
      -- Entradas duplicadas del mismo entity+id: se deduplican y se notifican como
      -- skipped para que el lote sea idempotente (nunca dos purgas/auditorias).
      if v_entity || '/' || v_id::text = any(v_done) then
        v_results := v_results || jsonb_build_object('operation', 'already_deleted', 'entity', v_entity, 'id', v_id, 'duplicate_in_batch', true, 'dry_run', p_dry_run);
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_done := v_done || (v_entity || '/' || v_id::text);
      v_target := public.dmp_lifecycle_target_company(v_entity, v_id);
      if v_target is distinct from p_company_id then
        raise exception 'purga: el registro no pertenece a la empresa indicada';
      end if;
      v_deps := public.dmp_lifecycle_dependencies(v_entity, v_id);
      v_code := coalesce(v_deps->>'code', v_id::text);
      v_res := public.dmp_purge_entity_with_cleanup(v_entity, v_id, p_reason, 'ELIMINAR ' || v_code,
                                                    '{}'::jsonb, true, p_dry_run);
      v_results := v_results || v_res;
      if v_res->>'operation' = 'purged' or v_res->>'operation' = 'dry_run' then
        v_ok := v_ok + 1;
      else
        -- already_deleted (raiz inexistente o duplicado real): sin evento nuevo.
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      if sqlerrm like '%Registro no encontrado%' then
        -- Raiz ya purgada por un paso anterior del mismo lote (p.ej. cascada
        -- quote -> parte): idempotente, sin evento de auditoria duplicado.
        v_results := v_results || jsonb_build_object('operation', 'already_deleted', 'entity', v_entity, 'id', v_id, 'dry_run', p_dry_run);
        v_skipped := v_skipped + 1;
      else
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_object('entity', v_entity, 'id', v_id, 'error', sqlerrm);
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'operation', 'purge_batch', 'company_id', p_company_id, 'dry_run', p_dry_run,
    'requested', jsonb_array_length(p_items), 'processed', v_ok, 'skipped', v_skipped, 'failed', v_failed,
    'results', v_results, 'errors', v_errors
  );
end;
$$;

-- ============================================================
-- 8) Permisos: solo la plataforma superadmin ejecuta la purga. El borrado
--    clasico 1-a-1 (022/023) sigue sin abrir privilegios a SAT/Gerencia.
-- ============================================================
revoke all on function public.dmp_lifecycle_dependencies(text, uuid) from public;
revoke all on function public.dmp_lifecycle_delete_plan(text, uuid) from public;
revoke all on function public.dmp_purge_document_links(text, uuid, text, uuid, text) from public;
revoke all on function public.dmp_refund_work_order_material_stock(uuid, uuid, text) from public;
revoke all on function public.dmp_purge_entity_with_cleanup(text, uuid, text, text, jsonb, boolean, boolean) from public;
revoke all on function public.dmp_purge_test_batch(uuid, jsonb, text, text, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.dmp_lifecycle_dependencies(text, uuid) from anon;
    revoke all on function public.dmp_lifecycle_delete_plan(text, uuid) from anon;
    revoke all on function public.dmp_purge_document_links(text, uuid, text, uuid, text) from anon;
    revoke all on function public.dmp_refund_work_order_material_stock(uuid, uuid, text) from anon;
    revoke all on function public.dmp_purge_entity_with_cleanup(text, uuid, text, text, jsonb, boolean, boolean) from anon;
    revoke all on function public.dmp_purge_test_batch(uuid, jsonb, text, text, boolean) from anon;
  end if;
end;
$$;

grant execute on function public.dmp_lifecycle_dependencies(text, uuid) to authenticated;
grant execute on function public.dmp_lifecycle_delete_plan(text, uuid) to authenticated;
grant execute on function public.dmp_purge_test_batch(uuid, jsonb, text, text, boolean) to authenticated;

commit;