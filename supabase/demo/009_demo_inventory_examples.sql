-- ONLY the dedicated public demo. Install after 008. No real orders or charges.
begin;
do $$ begin
 if to_regprocedure('public.dmp_demo_prepare_resource_rates(uuid)') is null
 or to_regclass('public.dmp_demo_sessions') is null then
  raise exception 'Demo: instala primero 008 en el proyecto de demostración';
 end if;
 if to_regprocedure('public.dmp_demo_prepare_team_before_examples(uuid)') is null then
  alter function public.dmp_demo_prepare_team(uuid) rename to dmp_demo_prepare_team_before_examples;
 end if;
end $$;
revoke all on function public.dmp_demo_prepare_team_before_examples(uuid) from public,anon,authenticated;
create or replace function public.dmp_demo_prepare_inventory_examples(c uuid) returns void
language plpgsql security definer set search_path=public as $$
declare supplier uuid; material uuid; warehouse uuid; actor uuid; item record;
begin
 if not exists(select 1 from public.dmp_demo_sessions where company_id=c and ended_at is null and least(expires_at,absolute_expires_at)>now()) then
  raise exception 'Demo: empresa temporal no activa';
 end if;
 -- Preserve all visitor modifications and never replenish an existing material.
 perform pg_advisory_xact_lock(hashtextextended('dmp-demo-examples:'||c::text,0));
 select profile_id into actor from public.dmp_demo_role_profiles where company_id=c and role_name='SAT';
 select id into warehouse from public.warehouses where company_id=c and code='ALM-DEMO' and deleted_at is null;
 if actor is null or warehouse is null then raise exception 'Demo: equipo o almacén de prueba no preparado'; end if;
 insert into public.suppliers(company_id,name,internal_code,trade_name,city,province,country,payment_method,payment_terms_days,internal_notes)
 values(c,'Suministros Horizonte · ejemplo','PRO-DEMO-HORIZONTE','Horizonte Demo','Zaragoza','Zaragoza','España','transferencia',30,'Proveedor ficticio; no envíes encargos reales.')
 on conflict do nothing;
 select id into supplier from public.suppliers where company_id=c and internal_code='PRO-DEMO-HORIZONTE' and deleted_at is null;
 for item in select * from (values
  ('MAT-DEMO-FOTO','Fotocélula de seguridad · ejemplo',30::numeric,55::numeric,12::numeric),
  ('MAT-DEMO-RODILLO','Rodillo para puerta seccional · ejemplo',8::numeric,16::numeric,6::numeric),
  ('MAT-DEMO-MANDO','Mando a distancia · ejemplo',12::numeric,25::numeric,0::numeric)
 ) v(code,description,cost,price,quantity) loop
  material:=null;
  insert into public.materials(company_id,code,description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled)
  values(c,item.code,item.description,'Fabricante de prueba',item.code,'ud',item.cost,item.price,2,true)
  on conflict(company_id,code) do nothing returning id into material;
  if material is not null then
   if item.quantity>0 then
    insert into public.warehouse_stock(company_id,warehouse_id,material_id,quantity) values(c,warehouse,material,item.quantity);
    insert into public.stock_movements(company_id,warehouse_id,material_id,movement_type,quantity,created_by,notes,idempotency_key)
    values(c,warehouse,material,'Entrada',item.quantity,actor,'Existencias iniciales ficticias para la demo; no proceden de una compra real.','demo-initial:'||material::text);
   end if;
   if supplier is not null then
    insert into public.material_suppliers(company_id,material_id,supplier_id,supplier_reference,purchase_unit_price,is_preferred)
    values(c,material,supplier,item.code,item.cost,true) on conflict do nothing;
   end if;
  end if;
 end loop;
end $$;
revoke all on function public.dmp_demo_prepare_inventory_examples(uuid) from public,anon,authenticated;
create or replace function public.dmp_demo_prepare_team(c uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.dmp_demo_prepare_team_before_examples(c);
 perform public.dmp_demo_prepare_inventory_examples(c);
end $$;
revoke all on function public.dmp_demo_prepare_team(uuid) from public,anon,authenticated;
do $$ declare c uuid; begin
 for c in select company_id from public.dmp_demo_sessions where cleanup_state='pending' and ended_at is null and least(expires_at,absolute_expires_at)>now() loop
  perform public.dmp_demo_prepare_team(c);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
