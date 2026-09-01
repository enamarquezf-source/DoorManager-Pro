-- DoorManager Pro - canonical stock runtime boundary.
-- Keeps the legacy columns/tables physically present for the transition.
begin;

create or replace function public.dmp_adjust_warehouse_stock(
  p_warehouse_id uuid,
  p_material_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text default null
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_warehouse public.warehouses;
  v_material public.materials;
  v_stock public.warehouse_stock;
  v_existing public.stock_movements;
  v_new numeric;
  v_delta numeric;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then
    raise exception 'permiso: no tienes permiso para ajustar stock';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'validacion del formulario: la cantidad debe ser mayor que cero';
  end if;
  if p_movement_type not in ('Entrada','Salida','Devolucion','Ajuste') then
    raise exception 'validacion del formulario: tipo de movimiento no valido';
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'validacion del formulario: el motivo es obligatorio';
  end if;
  select * into v_warehouse from public.warehouses
    where id = p_warehouse_id and company_id = public.current_company_id()
      and active and deleted_at is null;
  select * into v_material from public.materials
    where id = p_material_id and company_id = public.current_company_id()
      and deleted_at is null;
  if v_warehouse.id is null then raise exception 'stock: almacen no valido para la empresa'; end if;
  if v_material.id is null then raise exception 'material: material no valido para la empresa'; end if;
  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
      where company_id = v_material.company_id and idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      if v_existing.warehouse_id <> p_warehouse_id or v_existing.material_id <> p_material_id then
        raise exception 'conflicto: la clave idempotente ya se uso para otro stock';
      end if;
      select quantity into v_new from public.warehouse_stock where warehouse_id = p_warehouse_id and material_id = p_material_id;
      return v_new;
    end if;
  end if;
  select * into v_stock from public.warehouse_stock
    where company_id = v_material.company_id and warehouse_id = p_warehouse_id
      and material_id = p_material_id for update;
  if v_stock.id is null then raise exception 'stock: no existe saldo abierto para el almacen'; end if;
  v_delta := case when p_movement_type in ('Entrada','Devolucion') then p_quantity else -p_quantity end;
  if p_movement_type = 'Ajuste' then v_delta := p_quantity - v_stock.quantity; end if;
  v_new := v_stock.quantity + v_delta;
  if v_new < 0 and not coalesce(v_material.allow_negative_stock, false) then
    raise exception 'stock: stock insuficiente para %', v_material.code;
  end if;
  update public.warehouse_stock set quantity = v_new, updated_at = now() where id = v_stock.id;
  insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key)
  values (v_material.company_id, p_warehouse_id, p_material_id, p_movement_type, abs(v_delta), v_actor.id, p_reason, p_idempotency_key);
  return v_new;
end;
$$;

revoke all on function public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text) from public, anon;
grant execute on function public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text) to authenticated;

create or replace function public.dmp_create_material_with_stock(p_payload jsonb)
returns public.materials language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_company uuid := coalesce(nullif(p_payload->>'company_id','')::uuid, public.current_company_id());
  v_material public.materials;
  v_warehouse uuid := nullif(p_payload->>'warehouse_id','')::uuid;
  v_quantity numeric := coalesce(nullif(p_payload->>'initial_quantity','')::numeric, 0);
  v_code text;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para crear materiales'; end if;
  perform public.assert_member_of_current_company(v_company);
  if trim(coalesce(p_payload->>'description','')) = '' then raise exception 'material: la descripcion es obligatoria'; end if;
  if v_quantity < 0 then raise exception 'stock: la cantidad inicial no puede ser negativa'; end if;
  v_code := coalesce(nullif(trim(p_payload->>'code'),''), public.next_dmp_code(v_company,'materials','MAT',false,6));
  insert into public.materials(company_id,code,description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled,allow_negative_stock,is_specific,active)
  values(v_company,v_code,trim(p_payload->>'description'),nullif(trim(p_payload->>'manufacturer'),''),nullif(trim(p_payload->>'reference'),''),coalesce(nullif(trim(p_payload->>'unit'),''),'ud'),coalesce(nullif(p_payload->>'cost','')::numeric,0),coalesce(nullif(p_payload->>'price','')::numeric,0),coalesce(nullif(p_payload->>'minimum_stock','')::numeric,0),coalesce((p_payload->>'stock_controlled')::boolean,true),coalesce((p_payload->>'allow_negative_stock')::boolean,false),coalesce((p_payload->>'is_specific')::boolean,false),coalesce((p_payload->>'active')::boolean,true))
  returning * into v_material;
  if v_quantity > 0 then
    if v_warehouse is null then
      select id into v_warehouse from public.warehouses where company_id = v_company and code = 'ALM-CENTRAL' and active and deleted_at is null limit 1;
    end if;
    if v_warehouse is null then raise exception 'stock: selecciona un almacen para el stock inicial'; end if;
    insert into public.warehouse_stock(company_id, warehouse_id, material_id, quantity)
    values (v_company, v_warehouse, v_material.id, v_quantity);
    insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key)
    values (v_company, v_warehouse, v_material.id, 'Entrada', v_quantity, v_actor.id, 'Stock inicial al crear material', 'material-create:' || v_material.id);
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
  values(v_company,'materials',v_material.id,'MATERIAL_CREATE',v_actor.id,null,to_jsonb(v_material));
  return v_material;
end $$;

create or replace function public.dmp_apply_material_stock_movement(
  p_material_id uuid, p_movement_type text, p_quantity numeric, p_reason text,
  p_source text default 'manual', p_work_order_id uuid default null,
  p_work_order_material_id uuid default null, p_quote_id uuid default null,
  p_unit_cost numeric default null, p_created_by uuid default null
) returns numeric language plpgsql security definer set search_path = public as $$
begin
  raise exception 'stock: endpoint legacy retirado; usa stock canónico por almacén';
end;
$$;

create or replace function public.dmp_adjust_material_stock(p_material_id uuid, p_movement_type text, p_quantity numeric, p_reason text, p_unit_cost numeric default null)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  raise exception 'stock: endpoint legacy retirado; usa dmp_adjust_warehouse_stock';
end;
$$;

revoke all on function public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid) from public, anon, authenticated;
revoke all on function public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric) from public, anon, authenticated;

create or replace function public.dmp_delete_work_order_material(p_material_usage_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_usage public.work_order_materials;
  v_stock public.warehouse_stock;
  v_material public.materials;
  v_returned boolean;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into v_usage from public.work_order_materials where id = p_material_usage_id and deleted_at is null for update;
  if v_usage.id is null then raise exception 'material: material no encontrado'; end if;
  perform public.dmp024_assert_work_order_operator(v_usage.work_order_id, coalesce(v_usage.registered_by, v_profile.id) <> v_profile.id);
  if coalesce(v_usage.registered_by, v_profile.id) <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permisos para eliminar materiales de otros trabajadores'; end if;
  if v_usage.stock_validation_status <> 'validated' and coalesce(v_usage.stock_deducted_quantity, 0) > 0 then raise exception 'stock: consumo pendiente con descuento inconsistente'; end if;
  if v_usage.stock_validation_status = 'validated' and v_usage.stock_deducted_quantity > 0 then
    if v_usage.stock_warehouse_id is null then raise exception 'stock: consumo validado sin almacen canónico'; end if;
    select * into v_material from public.materials where id = v_usage.material_id and company_id = v_usage.company_id and deleted_at is null;
    select * into v_stock from public.warehouse_stock where company_id = v_usage.company_id and warehouse_id = v_usage.stock_warehouse_id and material_id = v_usage.material_id for update;
    if v_stock.id is null then raise exception 'stock: no existe saldo canónico para devolver el consumo'; end if;
    select exists (select 1 from public.stock_movements where company_id = v_usage.company_id and idempotency_key = 'work-order-material-return:' || v_usage.id) into v_returned;
    if not v_returned then
      update public.warehouse_stock set quantity = quantity + v_usage.stock_deducted_quantity, updated_at = now() where id = v_stock.id;
      insert into public.stock_movements(company_id,warehouse_id,material_id,movement_type,quantity,work_order_id,created_by,notes,work_order_material_id,idempotency_key)
      values(v_usage.company_id,v_usage.stock_warehouse_id,v_usage.material_id,'Devolucion',v_usage.stock_deducted_quantity,v_usage.work_order_id,v_profile.id,p_reason,v_usage.id,'work-order-material-return:' || v_usage.id);
    end if;
  end if;
  update public.work_order_materials set deleted_at = now(), stock_deducted_quantity = 0, updated_at = now() where id = p_material_usage_id;
end;
$$;

create or replace function public.dmp_refund_work_order_material_stock(p_usage_id uuid, p_actor_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_usage public.work_order_materials;
  v_stock public.warehouse_stock;
  v_returned boolean;
begin
  select * into v_usage from public.work_order_materials where id = p_usage_id for update;
  if v_usage.id is null or v_usage.stock_validation_status <> 'validated' or coalesce(v_usage.stock_deducted_quantity,0) <= 0 then return; end if;
  if v_usage.stock_warehouse_id is null then raise exception 'stock: consumo validado sin almacen canónico'; end if;
  select * into v_stock from public.warehouse_stock where company_id = v_usage.company_id and warehouse_id = v_usage.stock_warehouse_id and material_id = v_usage.material_id for update;
  if v_stock.id is null then raise exception 'stock: no existe saldo canónico para devolver el consumo'; end if;
  select exists (select 1 from public.stock_movements where company_id = v_usage.company_id and idempotency_key = 'work-order-material-return:' || v_usage.id) into v_returned;
  if not v_returned then
    update public.warehouse_stock set quantity = quantity + v_usage.stock_deducted_quantity, updated_at = now() where id = v_stock.id;
    insert into public.stock_movements(company_id,warehouse_id,material_id,movement_type,quantity,work_order_id,created_by,notes,work_order_material_id,idempotency_key)
    values(v_usage.company_id,v_usage.stock_warehouse_id,v_usage.material_id,'Devolucion',v_usage.stock_deducted_quantity,v_usage.work_order_id,p_actor_id,p_reason,v_usage.id,'work-order-material-return:' || v_usage.id);
  end if;
  update public.work_order_materials set stock_deducted_quantity = 0, updated_at = now() where id = v_usage.id;
end;
$$;

do $$
begin
  if to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)') is not null
     and to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)') is null then
    alter function public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)
      rename to dmp_purge_entity_with_cleanup_legacy;
  end if;
end;
$$;

create or replace function public.dmp_purge_entity_with_cleanup(
  p_entity text, p_entity_id uuid, p_reason text, p_confirmation text,
  p_scope jsonb default '{}'::jsonb, p_return_stock boolean default true,
  p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
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
  if v_material.id is null then return jsonb_build_object('operation','already_deleted','entity',p_entity,'id',p_entity_id,'dry_run',p_dry_run); end if;
  v_code := v_material.code;
  if p_confirmation is distinct from ('ELIMINAR ' || v_code) then raise exception 'purga: confirmacion incorrecta. Escribe ELIMINAR %', v_code; end if;
  if p_dry_run then return jsonb_build_object('operation','dry_run','entity',p_entity,'id',p_entity_id,'code',v_code,'dry_run',true); end if;
  if exists (select 1 from public.warehouse_stock where material_id = p_entity_id and quantity > 0) then raise exception 'purga: el material % tiene stock canónico activo', v_code; end if;
  if exists (select 1 from public.work_order_materials where material_id = p_entity_id) then raise exception 'purga: el material % tiene usos en partes', v_code; end if;
  if exists (select 1 from public.quote_lines where material_id = p_entity_id) then raise exception 'purga: el material % aparece en presupuestos', v_code; end if;
  delete from public.warehouse_stock where material_id = p_entity_id;
  delete from public.stock_movements where material_id = p_entity_id;
  delete from public.material_stock_movements where material_id = p_entity_id;
  delete from public.materials where id = p_entity_id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_material.company_id, 'materials', p_entity_id, 'DELETE', v_actor.id, to_jsonb(v_material), jsonb_build_object('reason',p_reason,'canonical_stock_purged',true));
  return jsonb_build_object('operation','purged','entity',p_entity,'id',p_entity_id,'code',v_code,'company_id',v_material.company_id,'stock_refund_units',0);
end;
$$;

revoke all on function public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean) from public, anon;
grant execute on function public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean) to authenticated;
revoke all on function public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean) from public, anon, authenticated;
grant execute on function public.dmp_delete_work_order_material(uuid,text) to authenticated;

commit;
