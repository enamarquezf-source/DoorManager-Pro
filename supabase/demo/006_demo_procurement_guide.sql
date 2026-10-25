-- Dedicated public demo only; install after 005. Preserves visitor records.
begin;
do $$ begin
 if to_regprocedure('public.dmp_demo_prepare_journey(text)') is null then raise exception 'Demo: instala primero 005'; end if;
 if to_regprocedure('public.dmp_demo_prepare_team_before_procurement(uuid)') is null then
  alter function public.dmp_demo_prepare_team(uuid) rename to dmp_demo_prepare_team_before_procurement;
 end if;
 if to_regprocedure('public.dmp_demo_progress_before_procurement()') is null then
  alter function public.dmp_demo_progress() rename to dmp_demo_progress_before_procurement;
 end if;
end $$;
revoke all on function public.dmp_demo_prepare_team_before_procurement(uuid),public.dmp_demo_progress_before_procurement() from public,anon,authenticated;
create or replace function public.dmp_demo_prepare_team(c uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.dmp_demo_prepare_team_before_procurement(c);
 insert into public.warehouses(company_id,code,name) values(c,'ALM-DEMO','Almacén de prueba') on conflict(company_id,code) do nothing;
end $$;
revoke all on function public.dmp_demo_prepare_team(uuid) from public,anon,authenticated;
-- An empty warehouse is a prerequisite, not fabricated received stock.
insert into public.warehouses(company_id,code,name)
 select s.company_id,'ALM-DEMO','Almacén de prueba' from public.dmp_demo_sessions s
 where s.cleanup_state='pending' and exists(select 1 from public.companies c where c.id=s.company_id)
 on conflict(company_id,code) do nothing;
create or replace function public.dmp_demo_progress() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare base jsonb; c uuid; w uuid;
begin
 base:=public.dmp_demo_progress_before_procurement();c:=public.current_company_id();
 select work_order_id into w from public.dmp_demo_sessions where auth_user_id=auth.uid();
 return base||jsonb_build_object(
 'catalog_materials',(select count(*) from materials where company_id=c and deleted_at is null and active and code not in('MAT-Oficina','MAT-Gerencia')),
 'suppliers',(select count(*) from suppliers where company_id=c and active),
 'purchase_orders',(select count(*) from purchase_orders o where o.company_id=c and o.archived_at is null and o.status<>'cancelled' and exists(select 1 from purchase_order_lines l where l.purchase_order_id=o.id)),
 'ordered_purchases',(select count(*) from purchase_orders where company_id=c and archived_at is null and status in('ordered','partially_received','received')),
 'purchase_receipts',(select count(*) from purchase_receipts where company_id=c and status='confirmed'),
 'received_stock',(select count(*) from warehouse_stock s where s.company_id=c and s.quantity>0 and exists(select 1 from purchase_receipt_lines l join purchase_receipts r on r.id=l.purchase_receipt_id where r.company_id=c and r.warehouse_id=s.warehouse_id and l.material_id=s.material_id and r.status='confirmed')),
 'work_materials',(select count(*) from work_order_materials where company_id=c and work_order_id=w and deleted_at is null and used_quantity>0));
end $$;
revoke all on function public.dmp_demo_progress() from public,anon,authenticated;
grant execute on function public.dmp_demo_progress() to authenticated;
notify pgrst,'reload schema';
commit;
