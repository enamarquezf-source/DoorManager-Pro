-- DoorManager Pro - incorpora partes terminales historicos al flujo 073/074.
-- Conservador, transaccional e idempotente. No crea facturas ni toca stock.

begin;

with candidates as (
  select w.id,
         w.company_id,
          to_jsonb(w) as old_data,
         case when coalesce(w.warranty,false) or not coalesce(w.billable,true)
           or w.economic_status in ('garantia','no_facturable') then 'validated'
           else 'pending' end as next_office_status,
         case when coalesce(w.warranty,false) then 'garantia'
              when not coalesce(w.billable,true) then 'no_facturable'
              when w.economic_status in ('garantia','no_facturable') then w.economic_status
          else 'pendiente_validacion' end as next_economic_status
  from public.work_orders w
   where w.deleted_at is null
    and w.status in ('Finalizado tecnicamente','Enviado','Cerrado')
    and w.office_validation_status='not_started'
     and coalesce(w.invoiced_amount,0)=0
     and coalesce(w.paid_amount,0)=0
    and w.economic_status not in ('facturado','cobrado')
    and not exists (select 1 from public.invoice_work_orders l where l.work_order_id=w.id and l.deleted_at is null)
)
insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
select c.company_id,'work_orders',c.id,'UPDATE',public.current_profile_id(),c.old_data,
       jsonb_build_object('compatibility_077',true,'office_validation_status',c.next_office_status,'economic_status',c.next_economic_status);

with candidates as (
  select w.id,
         case when coalesce(w.warranty,false) or not coalesce(w.billable,true)
           or w.economic_status in ('garantia','no_facturable') then 'validated'
           else 'pending' end as next_office_status,
         case when coalesce(w.warranty,false) then 'garantia'
              when not coalesce(w.billable,true) then 'no_facturable'
              when w.economic_status in ('garantia','no_facturable') then w.economic_status
          else 'pendiente_validacion' end as next_economic_status
  from public.work_orders w
   where w.deleted_at is null
     and w.status in ('Finalizado tecnicamente','Enviado','Cerrado')
     and w.office_validation_status='not_started'
     and coalesce(w.invoiced_amount,0)=0
     and coalesce(w.paid_amount,0)=0
     and w.economic_status not in ('facturado','cobrado')
    and not exists (select 1 from public.invoice_work_orders l where l.work_order_id=w.id and l.deleted_at is null)
)
update public.work_orders w
set office_validation_status=c.next_office_status,
     economic_status=c.next_economic_status,
     updated_at=now()
from candidates c
where w.id=c.id;

create or replace function public.dmp_review_work_order_office(p_work_order_id uuid, p_decision text, p_reason text)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_economic text;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para validar partes en oficina'; end if;
  if p_decision not in ('validated','rejected') then raise exception 'validacion: decision de oficina no valida'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'validacion: el motivo o comentario es obligatorio'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  v_old:=to_jsonb(v_work);
  if v_work.status not in ('Finalizado tecnicamente','Enviado','Cerrado') or v_work.office_validation_status not in ('pending','rejected') then raise exception 'validacion: el parte no esta pendiente de validacion de oficina'; end if;
  if p_decision='rejected' then
    update public.work_orders set status='Devuelto por SAT',economic_status='pendiente',office_validation_status='rejected',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,finished_at=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    update public.work_order_assignments set status='Asignado',updated_at=now() where work_order_id=v_work.id and deleted_at is null and status='Finalizado';
    insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,trim(p_reason),false);
  else
    v_economic:=case when v_work.warranty then 'garantia' when not v_work.billable then 'no_facturable' else 'pendiente_facturar' end;
    update public.work_orders set economic_status=v_economic,office_validation_status='validated',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    if v_work.quote_id is not null and exists(select 1 from public.quotes where id=v_work.quote_id and deleted_at is null and status='Aceptado') then
      perform public.dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente','Validado por oficina: '||trim(p_reason),null,v_actor.id);
    end if;
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,case when p_decision='validated' then 'OFFICE_VALIDATE' else 'OFFICE_REJECT' end,v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

revoke all on function public.dmp_review_work_order_office(uuid,text,text) from public,anon;
grant execute on function public.dmp_review_work_order_office(uuid,text,text) to authenticated;

commit;
