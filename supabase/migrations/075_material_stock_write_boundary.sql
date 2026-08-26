-- DoorManager Pro - stock is changed only through audited stock movements.

begin;

revoke update on table public.materials from authenticated;
grant update(description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled,allow_negative_stock,is_specific,active,deleted_at,deleted_by,delete_reason,updated_at) on table public.materials to authenticated;

create or replace function public.dmp_create_material_with_stock(p_payload jsonb)
returns public.materials language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_company uuid:=coalesce(nullif(p_payload->>'company_id','')::uuid,public.current_company_id()); v_material public.materials; v_stock numeric:=coalesce(nullif(p_payload->>'stock_quantity','')::numeric,0); v_code text;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para crear materiales'; end if;
  perform public.assert_member_of_current_company(v_company);
  if trim(coalesce(p_payload->>'description',''))='' then raise exception 'material: la descripcion es obligatoria'; end if;
  if v_stock<0 and not coalesce((p_payload->>'allow_negative_stock')::boolean,false) then raise exception 'stock: el stock inicial no puede ser negativo'; end if;
  v_code:=coalesce(nullif(trim(p_payload->>'code'),''),public.next_dmp_code(v_company,'materials','MAT',false,6));
  insert into public.materials(company_id,code,description,manufacturer,reference,unit,cost,price,stock_quantity,minimum_stock,stock_controlled,allow_negative_stock,is_specific,active)
  values(v_company,v_code,trim(p_payload->>'description'),nullif(trim(p_payload->>'manufacturer'),''),nullif(trim(p_payload->>'reference'),''),coalesce(nullif(trim(p_payload->>'unit'),''),'ud'),coalesce(nullif(p_payload->>'cost','')::numeric,0),coalesce(nullif(p_payload->>'price','')::numeric,0),0,coalesce(nullif(p_payload->>'minimum_stock','')::numeric,0),coalesce((p_payload->>'stock_controlled')::boolean,true),coalesce((p_payload->>'allow_negative_stock')::boolean,false),coalesce((p_payload->>'is_specific')::boolean,false),coalesce((p_payload->>'active')::boolean,true)) returning * into v_material;
  if v_stock>0 then perform public.dmp_adjust_material_stock(v_material.id,'in',v_stock,'Stock inicial al crear material',v_material.cost); end if;
  select * into v_material from public.materials where id=v_material.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_company,'materials',v_material.id,'MATERIAL_CREATE',v_actor.id,null,to_jsonb(v_material));
  return v_material;
end $$;

revoke all on function public.dmp_create_material_with_stock(jsonb) from public,anon;
grant execute on function public.dmp_create_material_with_stock(jsonb) to authenticated;

commit;
