-- DoorManager Pro - allow technical material evidence before stock opening.
-- Submit records pending evidence; validation remains the stock write boundary.
begin;

create or replace function public.dmp_submit_work_order_material(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_material public.materials;
  v_usage public.work_order_materials;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_material_id uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_warehouse_id uuid := nullif(p_payload->>'warehouse_id', '')::uuid;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 1);
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
begin
  if nullif(p_payload->>'work_order_id', '') is null then
    raise exception 'validacion del formulario: falta work_order_id';
  end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if v_material_id is null and trim(coalesce(p_payload->>'description', '')) = '' then
    raise exception 'validacion del formulario: indica material de catalogo o descripcion no catalogada';
  end if;
  if v_local is not null then
    select * into v_usage from public.work_order_materials
    where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local and deleted_at is null
    for update;
    if v_usage.id is not null then return v_usage.id; end if;
  end if;
  if v_id is not null then
    select * into v_usage from public.work_order_materials
    where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null
    for update;
    if v_usage.id is null then raise exception 'material: material no encontrado'; end if;
    if v_usage.stock_validation_status <> 'pending' then raise exception 'stock: el consumo validado es historico y no admite edicion'; end if;
    if v_usage.registered_by <> v_profile.id and not v_admin then raise exception 'permiso: material no editable para este usuario'; end if;
  end if;
  if v_material_id is not null then
    select * into v_material from public.materials where id = v_material_id and deleted_at is null for update;
    if v_material.id is null or v_material.company_id <> v_work.company_id then raise exception 'empresa: material no valido para la empresa del parte'; end if;
    if coalesce(v_material.stock_controlled, true) then
      if v_warehouse_id is null then raise exception 'stock: indica el almacen de origen para validar el consumo'; end if;
      if not exists (select 1 from public.warehouses where id = v_warehouse_id and company_id = v_work.company_id and active and deleted_at is null) then
        raise exception 'stock: almacen no valido para la empresa';
      end if;
    end if;
  end if;
  if v_usage.id is null then
    insert into public.work_order_materials(
      company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit,
      unit_cost, unit_price, notes, registered_by, used_at, local_change_id, stock_deducted_quantity,
      stock_validation_status, stock_warehouse_id
    ) values (
      v_work.company_id, v_work.id, v_material_id, nullif(p_payload->>'description', ''), 0, v_quantity,
      coalesce(nullif(p_payload->>'unit', ''), v_material.unit, 'ud'),
      case when v_material_id is null then 0 else coalesce(v_material.cost, 0) end,
      case when v_admin then coalesce(nullif(p_payload->>'unit_price', '')::numeric, v_material.price, 0) else 0 end,
      nullif(p_payload->>'notes', ''), v_profile.id,
      coalesce(nullif(p_payload->>'used_at', '')::date, current_date), v_local, 0,
      case when v_material_id is not null and coalesce(v_material.stock_controlled, true) then 'pending' else 'validated' end,
      case when v_material_id is not null and coalesce(v_material.stock_controlled, true) then v_warehouse_id else null end
    ) returning * into v_usage;
  else
    update public.work_order_materials set
      material_id = v_material_id, description = nullif(p_payload->>'description', ''), used_quantity = v_quantity,
      unit = coalesce(nullif(p_payload->>'unit', ''), unit, v_material.unit, 'ud'), notes = nullif(p_payload->>'notes', ''),
      used_at = coalesce(nullif(p_payload->>'used_at', '')::date, used_at, current_date),
      stock_warehouse_id = v_warehouse_id, updated_at = now()
    where id = v_usage.id returning * into v_usage;
  end if;
  return v_usage.id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

commit;
