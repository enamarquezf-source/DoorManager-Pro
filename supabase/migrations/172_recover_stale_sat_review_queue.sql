-- Make legacy technically-finalized work orders reviewable by SAT.
-- The UI previously hid not_started rows and the old function rejected them.
begin;

update public.work_orders
set sat_review_status='pending', updated_at=now()
where deleted_at is null
  and status in ('Finalizado tecnicamente','Devuelto por SAT')
  and office_validation_status='pending'
  and sat_review_status='not_started';

create or replace function public.dmp_review_work_order_sat(
  p_work_order_id uuid,
  p_decision text,
  p_destination text default null,
  p_flags jsonb default '{}'::jsonb,
  p_reason text default null
)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permiso para revisar partes en SAT'; end if;
  if p_decision not in ('approved','returned') then raise exception 'revision SAT: decision no valida'; end if;
  if p_decision='approved' and p_destination not in ('comercial','facturacion') then raise exception 'revision SAT: indica Comercial o Facturacion como destino'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status not in ('Finalizado tecnicamente','Devuelto por SAT') or v_work.sat_review_status not in ('not_started','pending','returned') then raise exception 'revision SAT: el parte no esta en la cola de SAT'; end if;
  v_old:=to_jsonb(v_work);
  if p_decision='returned' then
    update public.work_orders set status='Devuelto por SAT',sat_review_status='returned',sat_review_destination=null,sat_review_flags=coalesce(p_flags,'{}'::jsonb),sat_review_reason=nullif(v_reason,''),sat_reviewed_at=now(),sat_reviewed_by=v_actor.id,commercial_review_status='not_started',office_validation_status='rejected',office_validation_reason=nullif(v_reason,''),updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  else
    update public.work_orders set sat_review_status='approved',sat_review_destination=p_destination,sat_review_flags=coalesce(p_flags,'{}'::jsonb),sat_review_reason=nullif(v_reason,''),sat_reviewed_at=now(),sat_reviewed_by=v_actor.id,commercial_review_status=case when p_destination='comercial' then 'pending' else 'not_started' end,office_validation_status=case when p_destination='facturacion' then 'pending' else 'not_started' end,office_validation_reason=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  end if;
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,coalesce(nullif(v_reason,''),'Revisión SAT'),false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'UPDATE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

revoke all on function public.dmp_review_work_order_sat(uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.dmp_review_work_order_sat(uuid,text,text,jsonb,text) to authenticated;
commit;
