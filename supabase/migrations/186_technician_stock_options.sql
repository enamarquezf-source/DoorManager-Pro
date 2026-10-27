-- Read-only stock choices for an operator of the requested work. No table grants.
begin;
create or replace function public.dmp_technician_stock_options(p_work_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare work public.work_orders;
begin
 work:=public.dmp024_assert_work_order_operator(p_work_order_id,false);
 return jsonb_build_object(
  'warehouses',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'code',w.code,'name',w.name) order by w.name)
   from public.warehouses w where w.company_id=work.company_id and w.active and w.deleted_at is null),'[]'::jsonb),
  'stock',coalesce((select jsonb_agg(jsonb_build_object('warehouse_id',s.warehouse_id,'material_id',s.material_id,'quantity',s.quantity))
   from public.warehouse_stock s join public.warehouses w on w.id=s.warehouse_id and w.company_id=s.company_id
   join public.materials m on m.id=s.material_id and m.company_id=s.company_id
   where s.company_id=work.company_id and w.active and w.deleted_at is null and m.active and m.deleted_at is null),'[]'::jsonb)
 );
end $$;
revoke all on function public.dmp_technician_stock_options(uuid) from public,anon;
grant execute on function public.dmp_technician_stock_options(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
