-- DoorManager Pro - guided SAT, commercial and billing routing.
-- Keeps the existing office validation and economic snapshots as the source of truth.

begin;

alter table public.work_orders
  add column if not exists sat_review_status text not null default 'not_started',
  add column if not exists sat_review_destination text,
  add column if not exists sat_review_flags jsonb not null default '{}'::jsonb,
  add column if not exists sat_review_reason text,
  add column if not exists sat_reviewed_at timestamptz,
  add column if not exists sat_reviewed_by uuid references public.profiles(id),
  add column if not exists commercial_review_status text not null default 'not_started',
  add column if not exists commercial_review_reason text,
  add column if not exists commercial_reviewed_at timestamptz,
  add column if not exists commercial_reviewed_by uuid references public.profiles(id);

alter table public.work_orders drop constraint if exists work_orders_sat_review_status_check;
alter table public.work_orders add constraint work_orders_sat_review_status_check
  check (sat_review_status in ('not_started','pending','approved','returned'));
alter table public.work_orders drop constraint if exists work_orders_sat_review_destination_check;
alter table public.work_orders add constraint work_orders_sat_review_destination_check
  check (sat_review_destination is null or sat_review_destination in ('comercial','facturacion'));
alter table public.work_orders drop constraint if exists work_orders_commercial_review_status_check;
alter table public.work_orders add constraint work_orders_commercial_review_status_check
  check (commercial_review_status in ('not_started','pending','approved'));

update public.work_orders
set sat_review_status='pending'
where deleted_at is null
  and status='Finalizado tecnicamente'
  and office_validation_status='pending'
  and sat_review_status='not_started';

create or replace function public.dmp_initialize_guided_work_order_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.office_validation_status is not distinct from new.office_validation_status
     and old.sat_review_status is not distinct from new.sat_review_status
     and old.sat_review_destination is not distinct from new.sat_review_destination
     and old.commercial_review_status is not distinct from new.commercial_review_status then
    return new;
  end if;
  if new.office_validation_status='pending' and old.sat_review_status='not_started' then
    new.sat_review_status:='pending'; new.sat_review_destination:=null; new.sat_review_flags:='{}'::jsonb;
    new.sat_review_reason:=null; new.sat_reviewed_at:=null; new.sat_reviewed_by:=null;
    new.commercial_review_status:='not_started'; new.commercial_review_reason:=null;
    new.commercial_reviewed_at:=null; new.commercial_reviewed_by:=null;
  end if;
  return new;
end $$;

drop trigger if exists guided_work_order_review_init on public.work_orders;
create trigger guided_work_order_review_init
before update of status,office_validation_status,sat_review_status,sat_review_destination,commercial_review_status on public.work_orders
for each row execute function public.dmp_initialize_guided_work_order_review();

create or replace function public.dmp_review_work_order_sat(
  p_work_order_id uuid,
  p_decision text,
  p_destination text default null,
  p_flags jsonb default '{}'::jsonb,
  p_reason text default null
)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb; v_reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permiso para revisar partes en SAT'; end if;
  if p_decision not in ('approved','returned') then raise exception 'revision SAT: decision no valida'; end if;
  if p_decision='approved' and p_destination not in ('comercial','facturacion') then raise exception 'revision SAT: indica Comercial o Facturacion como destino'; end if;
  if v_reason='' then raise exception 'revision SAT: el comentario o motivo es obligatorio'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status not in ('Finalizado tecnicamente','Devuelto por SAT') or v_work.sat_review_status not in ('pending','returned') then raise exception 'revision SAT: el parte no esta en la cola de SAT'; end if;
  v_old:=to_jsonb(v_work);
  if p_decision='returned' then
    update public.work_orders set status='Devuelto por SAT',sat_review_status='returned',sat_review_destination=null,sat_review_flags=coalesce(p_flags,'{}'::jsonb),sat_review_reason=v_reason,sat_reviewed_at=now(),sat_reviewed_by=v_actor.id,commercial_review_status='not_started',office_validation_status='rejected',office_validation_reason=v_reason,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  else
    update public.work_orders set sat_review_status='approved',sat_review_destination=p_destination,sat_review_flags=coalesce(p_flags,'{}'::jsonb),sat_review_reason=v_reason,sat_reviewed_at=now(),sat_reviewed_by=v_actor.id,commercial_review_status=case when p_destination='comercial' then 'pending' else 'not_started' end,office_validation_status=case when p_destination='facturacion' then 'pending' else 'not_started' end,office_validation_reason=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  end if;
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,'Revision SAT: '||v_reason,false);
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
  update public.work_orders set commercial_review_status='approved',commercial_review_reason=v_reason,commercial_reviewed_at=now(),commercial_reviewed_by=v_actor.id,office_validation_status='pending',updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'UPDATE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

create or replace function public.dmp_review_work_order_office(p_work_order_id uuid, p_decision text, p_reason text)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb; v_economic text;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para validar partes en oficina'; end if;
  if p_decision not in ('validated','rejected') then raise exception 'validacion: decision de oficina no valida'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'validacion: el motivo o comentario es obligatorio'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id); v_old:=to_jsonb(v_work);
  if v_work.status<>'Finalizado tecnicamente' or v_work.office_validation_status not in ('pending','rejected') then raise exception 'validacion: el parte no esta pendiente de validacion de oficina'; end if;
  if v_work.sat_review_status<>'approved' or (v_work.sat_review_destination='comercial' and v_work.commercial_review_status<>'approved') then raise exception 'validacion: el parte debe completar la revision SAT y Comercial antes de oficina'; end if;
  if p_decision='rejected' then
    update public.work_orders set status='Devuelto por SAT',economic_status='pendiente',office_validation_status='rejected',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,sat_review_status='pending',sat_review_destination=null,commercial_review_status='not_started',finished_at=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
  else
    v_economic:=case when v_work.warranty then 'garantia' when not v_work.billable then 'no_facturable' else 'pendiente_facturar' end;
    update public.work_orders set economic_status=v_economic,office_validation_status='validated',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    if v_work.quote_id is not null and exists(select 1 from public.quotes where id=v_work.quote_id and deleted_at is null and status='Aceptado') then
      perform public.dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente','Validado por oficina: '||trim(p_reason),null,v_actor.id);
    end if;
  end if;
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,trim(p_reason),false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,case when p_decision='validated' then 'OFFICE_VALIDATE' else 'OFFICE_REJECT' end,v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

revoke all on function public.dmp_review_work_order_sat(uuid,text,text,jsonb,text) from public,anon;
grant execute on function public.dmp_review_work_order_sat(uuid,text,text,jsonb,text) to authenticated;
revoke all on function public.dmp_review_work_order_commercial(uuid,text) from public,anon;
grant execute on function public.dmp_review_work_order_commercial(uuid,text) to authenticated;

commit;
