-- DoorManager Pro - office validation and explicit additional sales.

begin;

alter table public.work_orders add column if not exists office_validation_status text not null default 'not_started';
alter table public.work_orders add column if not exists office_validated_at timestamptz;
alter table public.work_orders add column if not exists office_validated_by uuid references public.profiles(id);
alter table public.work_orders add column if not exists office_validation_reason text;
alter table public.work_orders drop constraint if exists work_orders_office_validation_status_check;
alter table public.work_orders add constraint work_orders_office_validation_status_check
  check (office_validation_status in ('not_started','pending','validated','rejected'));

alter table public.work_orders drop constraint if exists work_orders_economic_status_check;
alter table public.work_orders add constraint work_orders_economic_status_check
  check (economic_status in ('pendiente','pendiente_validacion','garantia','facturable','pendiente_facturar','facturado','cobrado','no_facturable'));

alter table public.work_order_materials add column if not exists source text not null default 'manual';
alter table public.work_order_materials add column if not exists contributes_to_sale boolean not null default false;
alter table public.work_order_materials drop constraint if exists work_order_materials_source_check;
alter table public.work_order_materials add constraint work_order_materials_source_check check (source in ('quote','manual','additional'));

alter table public.work_order_time_entries add column if not exists source text not null default 'manual';
alter table public.work_order_time_entries add column if not exists contributes_to_sale boolean not null default false;
alter table public.work_order_time_entries drop constraint if exists work_order_time_entries_source_check;
alter table public.work_order_time_entries add constraint work_order_time_entries_source_check check (source in ('quote','manual','additional'));

-- Existing entries on quoted work are conservatively treated as included in the quote.
update public.work_order_materials e set source='quote', contributes_to_sale=false
from public.work_orders w where w.id=e.work_order_id and w.quote_id is not null and e.source='manual';
update public.work_order_time_entries e set source='quote', contributes_to_sale=false
from public.work_orders w where w.id=e.work_order_id and w.quote_id is not null and e.source='manual';

create or replace function public.dmp_set_work_order_entry_billing(p_kind text, p_entry_id uuid, p_additional boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_company uuid;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) then
    raise exception 'permiso: solo perfiles de gestion pueden decidir ventas adicionales';
  end if;
  if p_kind = 'material' then
    select company_id into v_company from public.work_order_materials where id=p_entry_id and deleted_at is null;
    if v_company is null then raise exception 'material: consumo no encontrado'; end if;
    perform public.assert_member_of_current_company(v_company);
    update public.work_order_materials set source=case when p_additional then 'additional' else 'manual' end,
      contributes_to_sale=p_additional, updated_at=now() where id=p_entry_id;
  elsif p_kind = 'time' then
    select company_id into v_company from public.work_order_time_entries where id=p_entry_id;
    if v_company is null then raise exception 'horas: registro no encontrado'; end if;
    perform public.assert_member_of_current_company(v_company);
    update public.work_order_time_entries set source=case when p_additional then 'additional' else 'manual' end,
      contributes_to_sale=p_additional, updated_at=now(), updated_by=v_actor.id where id=p_entry_id;
  else
    raise exception 'tipo: clase de entrada economica no valida';
  end if;
end;
$$;

revoke all on function public.dmp_set_work_order_entry_billing(text,uuid,boolean) from public, anon;
grant execute on function public.dmp_set_work_order_entry_billing(text,uuid,boolean) to authenticated;

create or replace function public.dmp_planned_material_billing_source_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.decision='utilizado' and new.work_order_material_id is not null then
    update public.work_order_materials set source='quote', contributes_to_sale=false, updated_at=now()
    where id=new.work_order_material_id and company_id=new.company_id and work_order_id=new.work_order_id;
  end if;
  return new;
end $$;

drop trigger if exists planned_material_billing_source_trigger on public.work_order_planned_material_decisions;
create trigger planned_material_billing_source_trigger after insert or update on public.work_order_planned_material_decisions
for each row execute function public.dmp_planned_material_billing_source_trigger();

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb;
  v_real_cost numeric := 0; v_quote numeric := 0; v_additional numeric := 0; v_operational_sale numeric := 0; v_sale numeric := 0; v_margin numeric := 0;
  v_billable boolean; v_warranty boolean; v_has_quote boolean := false; v_pending integer := 0; v_pending_checks integer := 0;
begin
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Finalizado tecnicamente','Enviado','Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico', v_work.status; end if;
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or (public.has_any_role(array['Tecnico']) and exists (select 1 from public.work_order_assignments a where a.work_order_id=v_work.id and a.technician_id=v_actor.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;

  if v_work.quote_id is not null then
    select count(*) into v_pending
    from public.quote_lines ql
    where ql.quote_id=v_work.quote_id and ql.deleted_at is null and ql.line_type not in ('fee','discount','labor')
      and ((ql.line_type='material' or ql.material_id is not null) and not exists (
        select 1 from public.work_order_planned_material_decisions d where d.work_order_id=v_work.id and d.quote_line_id=ql.id and d.deleted_at is null
      ) or (ql.line_type<>'material' and ql.material_id is null and not exists (
        select 1 from public.work_order_quote_line_decisions d where d.work_order_id=v_work.id and d.quote_line_id=ql.id and d.deleted_at is null
      )));
    if v_pending > 0 then raise exception 'cierre incompleto: quedan % concepto(s) previstos sin confirmar o marcar como no realizados', v_pending; end if;
  end if;
  select count(*) into v_pending_checks from public.checks where work_order_id=v_work.id and deleted_at is null and status<>'Realizado';
  if v_pending_checks > 0 then raise exception 'cierre incompleto: quedan % check(s) sin finalizar', v_pending_checks; end if;

  v_old := to_jsonb(v_work);
  select round(coalesce(sum(total_cost),0),2) into v_real_cost from (
    select total_cost from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
    union all select total_cost from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
    union all select total_cost from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
  ) x;
  select round(coalesce(taxable_base,subtotal_sale,subtotal,0),2), true into v_quote,v_has_quote from public.quotes
    where company_id=v_work.company_id and deleted_at is null and status in ('Aceptado','Ejecutado en cliente') and (id=v_work.quote_id or work_order_id=v_work.id)
    order by case when id=v_work.quote_id then 0 else 1 end, issue_date desc nulls last, created_at desc nulls last, id desc limit 1;
  if not found then v_quote:=0; v_has_quote:=false; end if;
  select round(coalesce(sum(amount),0),2) into v_additional from (
    select total_price amount from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source='additional' and contributes_to_sale
    union all select total_price from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id and source='additional' and contributes_to_sale
    union all select total_price from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source='additional' and contributes_to_sale
  ) x;
  select round(coalesce(sum(total_price),0),2) into v_operational_sale from (
    select total_price from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
    union all select total_price from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
    union all select total_price from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source<>'quote' and contributes_to_sale
  ) x;
  v_warranty := case when p_payload?'warranty' then coalesce((p_payload->>'warranty')::boolean,false) else coalesce(v_work.warranty,false) or v_work.type='Garantia' end;
  v_billable := case when p_payload?'billable' then coalesce((p_payload->>'billable')::boolean,true) else coalesce(v_work.billable,true) end;
  if v_warranty then v_billable:=false; end if;
  if v_warranty or not v_billable then v_quote:=0; v_additional:=0; v_operational_sale:=0; end if;
  v_sale:=case when v_has_quote then round(v_quote+v_additional,2) else v_operational_sale end; v_margin:=round(v_sale-v_real_cost,2);
  update public.work_orders set status='Finalizado tecnicamente', economic_status='pendiente_validacion', office_validation_status='pending', office_validation_reason=null,
    office_validated_at=null, office_validated_by=null, billable=v_billable, warranty=v_warranty, quoted_sale_amount=coalesce(v_quote,0), additional_sale_amount=coalesce(v_additional,0), sale_amount=coalesce(v_sale,0), real_cost_amount=coalesce(v_real_cost,0), margin_amount=coalesce(v_margin,0), estimated_sale_amount=coalesce(v_sale,0), estimated_margin_amount=coalesce(v_margin,0), finished_at=coalesce(finished_at,now()), sent_at=null, updated_by=v_actor.id, updated_at=now()
  where id=v_work.id returning * into v_work;
  update public.work_order_assignments set status='Finalizado',updated_at=now() where work_order_id=v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico pendiente de oficina'),false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'TECHNICAL_FINALIZE_PENDING_OFFICE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

create or replace function public.dmp_review_work_order_office(p_work_order_id uuid, p_decision text, p_reason text)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb; v_economic text;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para validar partes en oficina'; end if;
  if p_decision not in ('validated','rejected') then raise exception 'validacion: decision de oficina no valida'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'validacion: el motivo o comentario es obligatorio'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id); v_old:=to_jsonb(v_work);
  if v_work.status<>'Finalizado tecnicamente' or v_work.office_validation_status not in ('pending','rejected') then raise exception 'validacion: el parte no esta pendiente de validacion de oficina'; end if;
  if p_decision='rejected' then
    update public.work_orders set status='Devuelto por SAT',economic_status='pendiente',office_validation_status='rejected',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,finished_at=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    update public.work_order_assignments set status='Asignado',updated_at=now() where work_order_id=v_work.id and deleted_at is null and status='Finalizado';
    insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,trim(p_reason),false);
  else
    v_economic:=case when v_work.warranty then 'garantia' when not v_work.billable then 'no_facturable' else 'pendiente_facturar' end;
    update public.work_orders set economic_status=v_economic,office_validation_status='validated',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    if v_work.quote_id is not null and exists(select 1 from public.quotes where id=v_work.quote_id and deleted_at is null and status='Aceptado') then
      perform public.dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente','Validado por oficina: '||trim(p_reason),null,v_actor.id);
      update public.quotes set work_order_id=coalesce(work_order_id,v_work.id) where id=v_work.quote_id;
    end if;
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,case when p_decision='validated' then 'OFFICE_VALIDATE' else 'OFFICE_REJECT' end,v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end $$;

revoke all on function public.dmp_finalize_work_order_technical(uuid,jsonb) from public,anon;
grant execute on function public.dmp_finalize_work_order_technical(uuid,jsonb) to authenticated;
revoke all on function public.dmp_review_work_order_office(uuid,text,text) from public,anon;
grant execute on function public.dmp_review_work_order_office(uuid,text,text) to authenticated;

create or replace view public.v_work_order_economic_summary with (security_invoker=true) as
with mat as (
  select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) material_cost,round(coalesce(sum(total_price),0),2) material_sale,
    round(coalesce(sum(total_price) filter(where source='additional' and contributes_to_sale),0),2) material_additional_sale
  from public.work_order_materials where deleted_at is null group by company_id,work_order_id
), tim as (
  select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) time_cost,round(coalesce(sum(total_price),0),2) time_sale,
    round(coalesce(sum(total_price) filter(where source='additional' and contributes_to_sale),0),2) time_additional_sale
  from public.work_order_time_entries group by company_id,work_order_id
), aux as (
  select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) auxiliary_cost,
    round(coalesce(sum(total_price) filter(where source<>'quote' and contributes_to_sale),0),2) auxiliary_sale,
    round(coalesce(sum(total_cost) filter(where cost_type='desplazamiento'),0),2) travel_cost,
    round(coalesce(sum(total_cost) filter(where cost_type='taller_movil'),0),2) mobile_workshop_cost,
    round(coalesce(sum(total_cost) filter(where cost_type='plataforma_elevadora'),0),2) platform_cost,
    round(coalesce(sum(total_cost) filter(where cost_type='coste_externo'),0),2) external_cost,
    round(coalesce(sum(total_price) filter(where source='additional' and contributes_to_sale),0),2) auxiliary_additional_sale
  from public.work_order_cost_entries where deleted_at is null group by company_id,work_order_id
), quoted as (
  select distinct on(wo.company_id,wo.id) wo.company_id,wo.id work_order_id,round(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0),2) quoted_sale_amount,true has_accepted_quote
  from public.work_orders wo join public.quotes q on q.company_id=wo.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') and(q.id=wo.quote_id or q.work_order_id=wo.id)
  order by wo.company_id,wo.id,case when q.id=wo.quote_id then 0 else 1 end,q.updated_at desc,q.id desc
), base as (
  select wo.*,c.legal_name client_name,s.name site_name,e.code equipment_code,
    coalesce(mat.material_cost,0) material_cost,coalesce(mat.material_sale,0) material_sale,
    coalesce(tim.time_cost,0) time_cost,coalesce(tim.time_sale,0) time_sale,
    coalesce(aux.auxiliary_cost,0) auxiliary_cost,coalesce(aux.auxiliary_sale,0) auxiliary_sale,
    coalesce(aux.travel_cost,0) travel_cost,coalesce(aux.mobile_workshop_cost,0) mobile_workshop_cost,coalesce(aux.platform_cost,0) platform_cost,coalesce(aux.external_cost,0) external_cost,
    coalesce(q.quoted_sale_amount,coalesce(wo.quoted_sale_amount,0)) quoted_calc,
    round(coalesce(mat.material_additional_sale,0)+coalesce(tim.time_additional_sale,0)+coalesce(aux.auxiliary_additional_sale,0),2) additional_calc,
    coalesce(q.has_accepted_quote,wo.quote_id is not null and coalesce(wo.quoted_sale_amount,0)>0,false) has_accepted_quote
  from public.work_orders wo left join public.clients c on c.id=wo.client_id and c.company_id=wo.company_id left join public.sites s on s.id=wo.site_id and s.company_id=wo.company_id left join public.equipment e on e.id=wo.main_equipment_id and e.company_id=wo.company_id
    left join mat on mat.company_id=wo.company_id and mat.work_order_id=wo.id left join tim on tim.company_id=wo.company_id and tim.work_order_id=wo.id left join aux on aux.company_id=wo.company_id and aux.work_order_id=wo.id left join quoted q on q.company_id=wo.company_id and q.work_order_id=wo.id
  where wo.deleted_at is null
), calc as (
  select b.*,round(b.material_cost+b.time_cost+b.auxiliary_cost,2) real_cost_calc,
    case when b.warranty or not b.billable or b.economic_status in ('garantia','no_facturable') then 0 when b.has_accepted_quote then round(b.quoted_calc+b.additional_calc,2) else round(b.material_sale+b.time_sale+b.auxiliary_sale,2) end sale_calc
  from base b
)
select id,company_id,code,title,status,type,scheduled_date,client_id,client_name,site_id,site_name,main_equipment_id,equipment_code,economic_status,billable,warranty,
  material_cost,time_cost,auxiliary_cost,travel_cost,mobile_workshop_cost,platform_cost,external_cost,real_cost_calc real_cost_amount,sale_calc estimated_sale_amount,
  round(sale_calc-real_cost_calc,2) estimated_margin_amount,invoiced_amount,paid_amount,sale_calc sale_amount,round(sale_calc-real_cost_calc,2) margin_amount,
  case when sale_calc>0 then round((sale_calc-real_cost_calc)/sale_calc*100,2) else null end margin_percentage,real_cost_calc real_cost,quoted_calc quoted_sale_amount,additional_calc additional_sale_amount,quote_id,
  time_sale,material_sale,auxiliary_sale,case when warranty or not billable or economic_status in ('garantia','no_facturable') then 'non_billable' when has_accepted_quote then 'quoted_plus_additional' else 'operational' end sale_model_expected
from calc;

create or replace view public.v_management_metrics with (security_invoker=true) as
with cc as(select company_id,count(*) clients from public.clients where deleted_at is null group by company_id),
ec as(select company_id,count(*) equipment from public.equipment where deleted_at is null group by company_id),
w as(select company_id,count(*) work_orders,count(*) filter(where scheduled_date>=date_trunc('month',current_date)::date) work_orders_this_month,
  count(*) filter(where status in('Finalizado tecnicamente','Enviado','Cerrado')) finished_work_orders,
  count(*) filter(where economic_status='pendiente_facturar' and sale_amount>0 and coalesce(invoiced_amount,0)=0 and not warranty) pending_invoice_work_orders,
  round(sum(real_cost_amount) filter(where warranty or economic_status='garantia'),2) warranty_cost,round(sum(real_cost_amount),2) real_cost,round(sum(sale_amount),2) sale_amount,round(sum(quoted_sale_amount),2) quoted_sale_amount,round(sum(additional_sale_amount),2) additional_sale_amount
  from public.v_work_order_economic_summary group by company_id),
q as(select q.company_id,count(*) filter(where q.status='Aceptado') accepted_quotes,count(*) filter(where q.status='Ejecutado en cliente') executed_quotes,round(sum(coalesce(q.tax_amount,0)),2) tax_amount,round(sum(coalesce(q.total_amount,q.total,0)),2) total_amount from public.quotes q where q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente') group by q.company_id)
select c.id company_id,coalesce(cc.clients,0) clients,coalesce(ec.equipment,0) equipment,coalesce(w.work_orders_this_month,0) work_orders_this_month,
  coalesce(q.accepted_quotes,0) accepted_quotes,coalesce(w.quoted_sale_amount,0) accepted_quote_amount,coalesce(w.work_orders,0) work_orders,coalesce(w.finished_work_orders,0) finished_work_orders,
  coalesce(w.warranty_cost,0) warranty_cost,coalesce(w.pending_invoice_work_orders,0) pending_invoice_work_orders,coalesce(q.executed_quotes,0) executed_quotes,
  coalesce(w.sale_amount,0) sale_amount,coalesce(q.tax_amount,0) tax_amount,coalesce(q.total_amount,0) total_amount,coalesce(w.real_cost,0) real_cost,
  round(coalesce(w.sale_amount,0)-coalesce(w.real_cost,0),2) margin_amount,case when coalesce(w.sale_amount,0)>0 then round((coalesce(w.sale_amount,0)-coalesce(w.real_cost,0))/coalesce(w.sale_amount,0)*100,2) else null end margin_percentage,
  coalesce(w.quoted_sale_amount,0) quoted_sale_amount,coalesce(w.additional_sale_amount,0) additional_sale_amount
from public.companies c left join cc on cc.company_id=c.id left join ec on ec.company_id=c.id left join w on w.company_id=c.id left join q on q.company_id=c.id;

commit;
