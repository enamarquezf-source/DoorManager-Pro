begin;

create or replace function public.dmp_lifecycle_dependencies(p_entity text, p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_company_id uuid;
  v_profile public.profiles;
  v_counts jsonb := '{}'::jsonb;
  v_archived boolean := false;
  v_code text;
  v_name text;
begin
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_profile := public.dmp_assert_lifecycle_actor(v_company_id);
  if p_entity = 'profiles' and not public.is_platform_superadmin() then raise exception 'Solo el propietario global puede consultar dependencias de usuarios'; end if;
  if p_entity = 'work_orders' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.work_orders where id = p_entity_id;
    v_counts := jsonb_build_object('materiales', (select count(*) from public.work_order_materials where work_order_id = p_entity_id), 'movimientos de stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id), 'documentos', (select count(*) from public.document_links where related_type = 'Parte' and related_id = p_entity_id));
  elsif p_entity = 'materials' then
    select coalesce(deleted_at is not null, false), code, description into v_archived, v_code, v_name from public.materials where id = p_entity_id;
    v_counts := jsonb_build_object('usos en partes', (select count(*) from public.work_order_materials where material_id = p_entity_id), 'lineas de presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id), 'existencias', (select count(*) from public.warehouse_stock where material_id = p_entity_id), 'movimientos historicos', (select count(*) from public.stock_movements where material_id = p_entity_id));
  elsif p_entity = 'quotes' then
    select coalesce(deleted_at is not null, false), code, title into v_archived, v_code, v_name from public.quotes where id = p_entity_id;
    v_counts := jsonb_build_object('lineas', (select count(*) from public.quote_lines where quote_id = p_entity_id), 'historial', (select count(*) from public.quote_status_history where quote_id = p_entity_id), 'vinculos', (select count(*) from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id));
  else
    v_counts := jsonb_build_object();
  end if;
  return jsonb_build_object('entity', p_entity, 'id', p_entity_id, 'company_id', v_company_id, 'code', coalesce(v_code, p_entity_id::text), 'name', coalesce(v_name, v_code, p_entity_id::text), 'archived', v_archived, 'dependencies', v_counts, 'dependency_total', 0, 'can_archive', true, 'can_restore', true, 'restore_blocker', null, 'can_permanently_delete', true, 'physical_delete_blocker', null);
end;
$$;

create or replace function public.dmp_lifecycle_delete_plan(p_entity text, p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_cascade jsonb := '{}'::jsonb;
  v_blocking jsonb := '{}'::jsonb;
begin
  if p_entity = 'work_orders' then
    v_cascade := jsonb_build_object('materiales', (select count(*) from public.work_order_materials where work_order_id = p_entity_id), 'presupuestos_vinculados', (select count(*) from public.quotes where work_order_id = p_entity_id));
    v_blocking := jsonb_build_object('documentos_enlazados', (select count(*) from public.document_links where related_type = 'Parte' and related_id = p_entity_id), 'movimientos_stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id), 'deficiencias_externas', (select count(*) from public.deficiencies where origin_work_order_id = p_entity_id and work_order_id is distinct from p_entity_id));
  elsif p_entity = 'quotes' then
    v_cascade := jsonb_build_object('lineas', (select count(*) from public.quote_lines where quote_id = p_entity_id), 'historial', (select count(*) from public.quote_status_history where quote_id = p_entity_id), 'vinculos', (select count(*) from public.case_links where related_type = 'Presupuesto' and related_id = p_entity_id));
    v_blocking := jsonb_build_object('partes_generados', (select count(*) from public.work_orders where quote_id = p_entity_id), 'deficiencias', (select count(*) from public.deficiencies where origin_quote_id = p_entity_id));
  elsif p_entity = 'materials' then
    v_blocking := jsonb_build_object('usos_en_partes', (select count(*) from public.work_order_materials where material_id = p_entity_id), 'movimientos_stock', (select count(*) from public.stock_movements where material_id = p_entity_id), 'lineas_presupuesto', (select count(*) from public.quote_lines where material_id = p_entity_id), 'existencias', (select count(*) from public.warehouse_stock where material_id = p_entity_id), 'stock_activo', case when coalesce((select sum(quantity) from public.warehouse_stock where material_id = p_entity_id), 0) > 0 then 1 else 0 end);
  end if;
  return jsonb_build_object('can_controlled_cascade_delete', false, 'cascade_dependencies', v_cascade, 'blocking_dependencies', v_blocking);
end;
$$;

create or replace function public.dmp_purge_entity_with_cleanup_legacy(p_entity text, p_entity_id uuid, p_reason text, p_confirmation text, p_scope jsonb default '{}'::jsonb, p_return_stock boolean default true, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_usage public.work_order_materials;
begin
  if p_entity = 'work_orders' then
    if exists (select 1 from public.stock_movements where work_order_id = p_entity_id) and coalesce(p_scope->>'stock_movements', 'block') <> 'purge' then raise exception 'purga: hay movimientos de stock historicos vinculados al parte'; end if;
    if p_return_stock then
      for v_usage in select * from public.work_order_materials where work_order_id = p_entity_id loop
        perform public.dmp_refund_work_order_material_stock(v_usage.id, null, p_reason);
      end loop;
      delete from public.stock_movements where work_order_id = p_entity_id;
    end if;
  elsif p_entity = 'quotes' then
    null;
  elsif p_entity = 'materials' then
    if exists (select 1 from public.work_order_materials where material_id = p_entity_id) and coalesce((p_scope->>'force')::boolean, false) = false then raise exception 'purga: el material tiene usos en partes'; end if;
    if exists (select 1 from public.quote_lines where material_id = p_entity_id) and coalesce((p_scope->>'force')::boolean, false) = false then raise exception 'purga: el material aparece en presupuestos'; end if;
    if exists (select 1 from public.warehouse_stock where material_id = p_entity_id) and coalesce((p_scope->>'force')::boolean, false) = false then raise exception 'purga: el material tiene existencias de almacen'; end if;
    if exists (select 1 from public.stock_movements where material_id = p_entity_id) and coalesce((p_scope->>'force')::boolean, false) = false then raise exception 'purga: el material tiene movimientos de stock'; end if;
  end if;
  return jsonb_build_object('operation', 'validated', 'entity', p_entity, 'id', p_entity_id, 'dry_run', p_dry_run);
end;
$$;

create or replace function public.dmp_purge_entity_with_cleanup(p_entity text, p_entity_id uuid, p_reason text, p_confirmation text, p_scope jsonb default '{}'::jsonb, p_return_stock boolean default true, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_material public.materials;
  v_actor public.profiles;
  v_code text;
begin
  if p_entity <> 'materials' then return public.dmp_purge_entity_with_cleanup_legacy(p_entity, p_entity_id, p_reason, p_confirmation, p_scope, p_return_stock, p_dry_run); end if;
  v_actor := public.dmp_assert_lifecycle_actor(public.current_company_id());
  select * into v_material from public.materials where id = p_entity_id for update;
  if v_material.id is null then return jsonb_build_object('operation', 'already_deleted', 'entity', p_entity, 'id', p_entity_id, 'dry_run', p_dry_run); end if;
  v_code := v_material.code;
  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then raise exception 'purga: confirmacion incorrecta. Escribe ELIMINAR %', v_code; end if;
  if p_dry_run then return jsonb_build_object('operation', 'dry_run', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'dry_run', true); end if;
  if exists (select 1 from public.warehouse_stock where material_id = p_entity_id and quantity > 0) then raise exception 'purga: el material tiene stock canonico activo'; end if;
  if exists (select 1 from public.work_order_materials where material_id = p_entity_id) then raise exception 'purga: el material tiene usos en partes'; end if;
  if exists (select 1 from public.quote_lines where material_id = p_entity_id) then raise exception 'purga: el material aparece en presupuestos'; end if;
  delete from public.warehouse_stock where material_id = p_entity_id;
  delete from public.stock_movements where material_id = p_entity_id;
  delete from public.materials where id = p_entity_id;
  return jsonb_build_object('operation', 'purged', 'entity', p_entity, 'id', p_entity_id, 'code', v_code, 'company_id', v_material.company_id, 'stock_refund_units', 0);
end;
$$;

do $$
declare
  v_count integer;
  v_definition text;
  v_proc regprocedure;
begin
  foreach v_proc in array array[
    to_regprocedure('public.dmp_lifecycle_dependencies(text,uuid)'),
    to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)'),
    to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)'),
    to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)')
  ] loop
    if v_proc is null then raise exception 'VALIDATE_110_FUNCTION_MISSING'; end if;
    select pg_get_functiondef(v_proc::oid) into v_definition;
    if position('material_stock_movements' in lower(v_definition)) > 0 then raise exception 'VALIDATE_110_LEGACY_REFERENCE'; end if;
    if position('stock_movements.quote_id' in lower(v_definition)) > 0 then raise exception 'VALIDATE_110_QUOTE_REFERENCE'; end if;
    if not exists (select 1 from pg_proc where oid = v_proc::oid and prosecdef) then raise exception 'VALIDATE_110_SECURITY_DEFINER'; end if;
    if not exists (select 1 from pg_proc where oid = v_proc::oid and coalesce(array_to_string(proconfig, ','), '') like '%search_path=public%') then raise exception 'VALIDATE_110_SEARCH_PATH'; end if;
  end loop;
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p') and position('material_stock_movements' in lower(pg_get_functiondef(p.oid))) > 0;
  if v_count <> 0 then raise exception 'VALIDATE_110_RUNTIME_LEGACY_REFERENCES'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'quote_id') then raise exception 'VALIDATE_110_QUOTE_COLUMN'; end if;
  raise notice 'VALIDATE_110_FUNCTIONS_OK';
end;
$$;

rollback;
