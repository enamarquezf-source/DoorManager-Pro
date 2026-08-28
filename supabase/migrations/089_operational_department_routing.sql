-- DoorManager Pro - operational department routing and commercial ownership.
-- Reuses work_orders.current_responsible_id for the commercial reviewer.
-- Does not change invoices, economics, snapshots or customer-facing data.

begin;

drop function if exists public.dmp_review_work_order_sat(uuid, text, text, jsonb, text);

create or replace function public.dmp_review_work_order_sat(
  p_work_order_id uuid,
  p_decision text,
  p_destination text default null,
  p_commercial_profile_id uuid default null,
  p_flags jsonb default '{}'::jsonb,
  p_reason text default null
)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_flags jsonb:=jsonb_build_object('materials_entered',(p_flags->>'materials_entered')='true','work_completed',(p_flags->>'work_completed')='true','non_billable_materials_or_hours',(p_flags->>'non_billable_materials_or_hours')='true');
  v_old_responsible uuid;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permiso para revisar partes en SAT'; end if;
  if p_decision not in ('approved','returned') then raise exception 'revision SAT: decision no valida'; end if;
  if p_decision='approved' and p_destination not in ('comercial','facturacion') then raise exception 'revision SAT: indica Comercial o Facturacion como destino'; end if;
  if p_decision='returned' and (p_destination is not null or p_commercial_profile_id is not null) then raise exception 'revision SAT: una devolucion no puede tener destino ni comercial'; end if;
  if p_destination='comercial' and p_commercial_profile_id is null then raise exception 'revision SAT: selecciona un comercial responsable'; end if;
  if p_destination='facturacion' and p_commercial_profile_id is not null then raise exception 'revision SAT: Facturacion no admite comercial responsable'; end if;
  if v_reason='' then raise exception 'revision SAT: el comentario o motivo es obligatorio'; end if;

  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status not in ('Finalizado tecnicamente','Devuelto por SAT') or v_work.sat_review_status not in ('pending','returned') then raise exception 'revision SAT: el parte no esta en la cola de SAT'; end if;
  v_old:=to_jsonb(v_work);
  v_old_responsible:=v_work.current_responsible_id;

  if p_destination='comercial' and not exists (
    select 1 from public.profiles p
    where p.id=p_commercial_profile_id and p.company_id=v_work.company_id and p.active=true and p.deleted_at is null
      and (p.primary_area='Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id=pr.role_id where pr.profile_id=p.id and r.name='Comercial'))
  ) then raise exception 'revision SAT: el comercial no pertenece a la empresa o no esta activo'; end if;

  if p_decision='returned' then
    update public.work_orders set status='Devuelto por SAT',sat_review_status='returned',sat_review_destination=null,sat_review_flags=v_flags,sat_review_reason=v_reason,sat_reviewed_at=now(),sat_reviewed_by=v_actor.id,commercial_review_status='not_started',current_responsible_id=case when exists (select 1 from public.profiles p where p.id=current_responsible_id and (p.primary_area='Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id=pr.role_id where pr.profile_id=p.id and r.name='Comercial'))) then null else current_responsible_id end,office_validation_status='rejected',updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  else
    update public.work_orders set sat_review_status='approved',sat_review_destination=p_destination,sat_review_flags=v_flags,sat_review_reason=v_reason,sat_reviewed_at=now(),sat_reviewed_by=v_actor.id,commercial_review_status=case when p_destination='comercial' then 'pending' else 'not_started' end,current_responsible_id=case when p_destination='comercial' then p_commercial_profile_id when exists (select 1 from public.profiles p where p.id=current_responsible_id and (p.primary_area='Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id=pr.role_id where pr.profile_id=p.id and r.name='Comercial'))) then null else current_responsible_id end,office_validation_status=case when p_destination='facturacion' then 'pending' else 'not_started' end,office_validation_reason=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  end if;

  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,'Revision SAT: '||v_reason||case when p_destination='comercial' then ' · comercial='||p_commercial_profile_id else '' end,false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'UPDATE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

create or replace function public.dmp_review_work_order_commercial(p_work_order_id uuid, p_reason text)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb; v_reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','Comercial','Gerencia']) then raise exception 'permiso: no tienes permiso para aprobar partes en Comercial'; end if;
  if v_reason='' then raise exception 'revision Comercial: el comentario o motivo es obligatorio'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id); v_old:=to_jsonb(v_work);
  if v_work.sat_review_destination<>'comercial' or v_work.commercial_review_status<>'pending' then raise exception 'revision Comercial: el parte no esta pendiente de aprobacion'; end if;
  if public.has_any_role(array['Comercial']) and not public.has_any_role(array['superadmin','Gerencia']) and v_work.current_responsible_id<>v_actor.id then raise exception 'revision Comercial: el parte no esta asignado al usuario actual'; end if;
  update public.work_orders set commercial_review_status='approved',commercial_review_reason=v_reason,commercial_reviewed_at=now(),commercial_reviewed_by=v_actor.id,office_validation_status='pending',updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'UPDATE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

create or replace function public.dmp_reassign_work_order_commercial(p_work_order_id uuid, p_commercial_profile_id uuid)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb; v_old_id uuid;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permiso para reasignar comerciales'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.sat_review_destination<>'comercial' or v_work.commercial_review_status<>'pending' then raise exception 'revision Comercial: solo se puede reasignar una revision pendiente'; end if;
  if not exists (select 1 from public.profiles p where p.id=p_commercial_profile_id and p.company_id=v_work.company_id and p.active=true and p.deleted_at is null and (p.primary_area='Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id=pr.role_id where pr.profile_id=p.id and r.name='Comercial'))) then raise exception 'revision SAT: el comercial no pertenece a la empresa o no esta activo'; end if;
  v_old:=to_jsonb(v_work); v_old_id:=v_work.current_responsible_id;
  update public.work_orders set current_responsible_id=p_commercial_profile_id,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_work.status,v_work.status,v_actor.id,'Reasignacion Comercial: anterior='||coalesce(v_old_id::text,'null')||' nuevo='||p_commercial_profile_id,false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'UPDATE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

create or replace function public.dmp_department_routing_queue(p_queue text)
returns table(id uuid,company_id uuid,code text,title text,client_name text,site_name text,equipment_names text,description text,quote_code text,sat_reviewed_at timestamptz,sat_reviewer_name text,sat_review_flags jsonb,sat_review_reason text,current_responsible_id uuid,commercial_review_status text,commercial_review_reason text,commercial_reviewed_at timestamptz,source text,entered_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_supervisor boolean:=public.has_any_role(array['superadmin','SAT','Gerencia']);
begin
  if p_queue not in ('sat','commercial','billing') then raise exception 'cola: departamento no valido'; end if;
  if p_queue='sat' and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes acceso a la cola SAT'; end if;
  if p_queue='billing' and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes acceso a la cola de Facturacion'; end if;
  if p_queue='commercial' and not (public.has_any_role(array['superadmin','SAT','Gerencia','Comercial'])) then raise exception 'permiso: no tienes acceso a la cola Comercial'; end if;
  return query
  select wo.id,wo.company_id,wo.code,wo.title,c.legal_name,s.name,
    string_agg(distinct coalesce(e.code,e.name),', ' order by coalesce(e.code,e.name)),wo.description,
    q.code,wo.sat_reviewed_at,trim(coalesce(sp.first_name||' ','')||coalesce(sp.last_name,'')),wo.sat_review_flags,wo.sat_review_reason,
    wo.current_responsible_id,wo.commercial_review_status,wo.commercial_review_reason,wo.commercial_reviewed_at,
    case when wo.sat_review_destination='comercial' then 'Desde Comercial' else 'Desde SAT' end,
    case when wo.sat_review_destination='comercial' then wo.commercial_reviewed_at else wo.sat_reviewed_at end
  from public.work_orders wo
  left join public.clients c on c.id=wo.client_id
  left join public.sites s on s.id=wo.site_id
  left join public.quotes q on q.id=wo.quote_id
  left join public.profiles sp on sp.id=wo.sat_reviewed_by
  left join public.work_order_equipment we on we.work_order_id=wo.id
  left join public.equipment e on e.id=we.equipment_id
  where wo.company_id=v_company and wo.deleted_at is null and wo.status not in ('Cerrado','Cancelado')
    and (not exists (select 1 from public.invoice_work_orders iw where iw.work_order_id=wo.id and iw.deleted_at is null))
    and ((p_queue='sat' and wo.sat_review_status='pending')
      or (p_queue='commercial' and wo.sat_review_destination='comercial' and wo.commercial_review_status='pending' and (v_supervisor or wo.current_responsible_id=public.current_profile_id()))
      or (p_queue='billing' and wo.sat_review_status='approved' and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved'))))
  group by wo.id,c.legal_name,s.name,q.code,sp.first_name,sp.last_name;
end $$;

-- Requeue only 088-era commercial reviews that have no valid commercial owner.
-- The predicate is intentionally identical to the preflight candidate predicate.
with candidates as (
  select wo.id,wo.company_id,wo.status,to_jsonb(wo) as old_data
  from public.work_orders wo
  where wo.deleted_at is null
    and wo.commercial_review_status='pending'
    and wo.sat_review_status='approved'
    and wo.sat_review_destination='comercial'
    and (wo.current_responsible_id is null or not exists (
      select 1 from public.profiles p
      where p.id=wo.current_responsible_id and p.company_id=wo.company_id and p.active=true and p.deleted_at is null
        and (p.primary_area='Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id=pr.role_id where pr.profile_id=p.id and r.name='Comercial'))
    ))
), requeued as (
  update public.work_orders wo
  set sat_review_status='pending',
      sat_review_destination=null,
      commercial_review_status='not_started',
      current_responsible_id=case when exists (
        select 1 from public.profiles p
        where p.id=wo.current_responsible_id
          and (p.primary_area='Comercial' or exists (select 1 from public.profile_roles pr join public.roles r on r.id=pr.role_id where pr.profile_id=p.id and r.name='Comercial'))
      ) then null else wo.current_responsible_id end,
      office_validation_status=case when wo.office_validation_status in ('not_started','pending') then 'pending' else wo.office_validation_status end,
      updated_at=now()
  from candidates c
  where wo.id=c.id
  returning wo.id,wo.company_id
)
insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
select c.company_id,'work_orders',c.id,'UPDATE',null,c.old_data,to_jsonb(wo)
from candidates c
join requeued r on r.id=c.id
join public.work_orders wo on wo.id=c.id;

revoke all on function public.dmp_review_work_order_sat(uuid,text,text,uuid,jsonb,text) from public;
revoke all on function public.dmp_review_work_order_sat(uuid,text,text,uuid,jsonb,text) from anon;
grant execute on function public.dmp_review_work_order_sat(uuid,text,text,uuid,jsonb,text) to authenticated;
revoke all on function public.dmp_review_work_order_commercial(uuid,text) from public;
revoke all on function public.dmp_review_work_order_commercial(uuid,text) from anon;
grant execute on function public.dmp_review_work_order_commercial(uuid,text) to authenticated;
revoke all on function public.dmp_reassign_work_order_commercial(uuid,uuid) from public;
revoke all on function public.dmp_reassign_work_order_commercial(uuid,uuid) from anon;
grant execute on function public.dmp_reassign_work_order_commercial(uuid,uuid) to authenticated;
revoke all on function public.dmp_department_routing_queue(text) from public;
revoke all on function public.dmp_department_routing_queue(text) from anon;
grant execute on function public.dmp_department_routing_queue(text) to authenticated;

commit;
