-- DoorManager Pro - explicit material characteristics.
-- These flags are independent master-data properties and do not alter stock.
begin;

alter table public.materials
  add column if not exists made_to_measure boolean not null default false,
  add column if not exists single_use boolean not null default false;

-- Migration 075 grants authenticated a controlled direct UPDATE surface for
-- materials; extend that existing RLS-governed surface only for these flags.
grant update(made_to_measure, single_use) on public.materials to authenticated;

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
  insert into public.materials(company_id,code,description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled,allow_negative_stock,is_specific,made_to_measure,single_use,active)
  values(v_company,v_code,trim(p_payload->>'description'),nullif(trim(p_payload->>'manufacturer'),''),nullif(trim(p_payload->>'reference'),''),coalesce(nullif(trim(p_payload->>'unit'),''),'ud'),coalesce(nullif(p_payload->>'cost','')::numeric,0),coalesce(nullif(p_payload->>'price','')::numeric,0),coalesce(nullif(p_payload->>'minimum_stock','')::numeric,0),coalesce((p_payload->>'stock_controlled')::boolean,true),coalesce((p_payload->>'allow_negative_stock')::boolean,false),coalesce((p_payload->>'is_specific')::boolean,false),coalesce((p_payload->>'made_to_measure')::boolean,false),coalesce((p_payload->>'single_use')::boolean,false),coalesce((p_payload->>'active')::boolean,true))
  returning * into v_material;
  if v_quantity > 0 then
    if v_warehouse is null then raise exception 'stock: selecciona un almacen para el stock inicial'; end if;
    perform public.dmp_adjust_warehouse_stock(v_warehouse, v_material.id, 'Entrada', v_quantity, 'Stock inicial al crear material', 'material-create:' || v_material.id);
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
  values(v_company,'materials',v_material.id,'MATERIAL_CREATE',v_actor.id,null,to_jsonb(v_material));
  return v_material;
end $$;

revoke all on function public.dmp_create_material_with_stock(jsonb) from public, anon;
grant execute on function public.dmp_create_material_with_stock(jsonb) to authenticated;

commit;
