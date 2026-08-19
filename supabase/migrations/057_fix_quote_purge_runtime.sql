-- DoorManager Pro - fix 057: runtime de la purga de presupuestos (SQLSTATE 42703).
-- Idempotente. Redefine SOLO public.dmp_purge_entity_with_cleanup partiendo EXACTAMENTE
-- de la version efectiva de 055 (que YA esta aplicada en Supabase y NO se modifica).
--
-- CAUSA del fallo runtime de la purga real de quotes:
--   055 usaba la variable v_scope en los dos INSERT finales de auditoria
--   (audit_log y activity_log: new_data 'scope' y metadata 'scope') pero NUNCA la
--   declaraba en el bloque DECLARE. En PostgreSQL una referencia a un identificador
--   sin declarar produce SQLSTATE 42703 ("column \"v_scope\" does not exist" o
--   "variable \"v_scope\" does not exist") solo al EJECUTAR esa sentencia.
--   El dry_run funciona porque hace return ANTES de esos INSERT (055:506-513) y el
--   plan se calcula en las mismas SELECTs que la ejecucion; por eso el error solo
--   aparece al pulsar "Eliminar definitivamente" (dry_run=false).
-- La rama quotes muta correctamente (lineas, historial, stock, vinculos, quote) pero
-- la transaccion del RPC hace rollback completo por el error del evento final.
--
-- Correccion minima: declarar v_scope jsonb y asignarla desde p_scope antes de los INSERT.
-- No toca 001-056, no redefine nada mas, no amplia alcance ni toca stock/partes/materiales.

begin;

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
  v_scope jsonb;
begin
  v_scope := p_scope;

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
-- CREATE OR REPLACE conserva los grants existentes; se reafirma el de 056 por idempotencia.
grant execute on function public.dmp_purge_entity_with_cleanup(text, uuid, text, text, jsonb, boolean, boolean) to authenticated;

commit;
