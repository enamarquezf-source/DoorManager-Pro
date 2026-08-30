-- NO APLICAR. DISENO SUPERADO POR AUDITORIA FUNDACIONAL. PENDIENTE DE REDISENO.
-- DoorManager Pro - garantías parciales: coste real separado de facturación.
-- Idempotente. No hace backfill económico ni modifica facturas existentes.
begin;

alter table public.work_order_planned_material_decisions
  add column if not exists billing_decision text;
alter table public.work_order_planned_material_decisions
  drop constraint if exists work_order_planned_material_decisions_billing_check;
alter table public.work_order_planned_material_decisions
  add constraint work_order_planned_material_decisions_billing_check
  check (billing_decision is null or billing_decision in ('cubierto_garantia','facturable'));

alter table public.work_order_quote_line_decisions
  add column if not exists billing_decision text;
alter table public.work_order_quote_line_decisions
  drop constraint if exists work_order_quote_line_decisions_billing_check;
alter table public.work_order_quote_line_decisions
  add constraint work_order_quote_line_decisions_billing_check
  check (billing_decision is null or billing_decision in ('cubierto_garantia','facturable'));

create or replace function public.dmp_recalculate_work_order_economics(p_work_order_id uuid)
returns public.work_orders
language plpgsql security definer set search_path = public
as $$
declare
  v_work public.work_orders;
  v_real_cost numeric := 0;
  v_quote numeric := 0;
  v_additional numeric := 0;
  v_operational_sale numeric := 0;
  v_sale numeric := 0;
  v_billable boolean := false;
  v_status text;
begin
  select * into v_work from public.work_orders
  where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;

  select round(coalesce(sum(total_cost),0),2) into v_real_cost from (
    select total_cost from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
    union all select total_cost from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
    union all select total_cost from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
  ) costs;

  if v_work.warranty then
    select round(coalesce(sum(coalesce(nullif(ql.total_price,0),nullif(ql.total,0),round(ql.quantity*ql.unit_price*(1-ql.discount_percent/100),2))),0),2)
      into v_quote
    from public.quote_lines ql
    join public.quotes q on q.id=ql.quote_id and q.company_id=ql.company_id and q.deleted_at is null
      and q.status in ('Aceptado','Ejecutado en cliente')
    where ql.company_id=v_work.company_id and ql.quote_id=v_work.quote_id and ql.deleted_at is null
      and exists (
        select 1 from public.work_order_planned_material_decisions md
        where md.company_id=v_work.company_id and md.work_order_id=v_work.id and md.quote_line_id=ql.id
          and md.deleted_at is null and md.billing_decision='facturable'
        union all
        select 1 from public.work_order_quote_line_decisions ld
        where ld.company_id=v_work.company_id and ld.work_order_id=v_work.id and ld.quote_line_id=ql.id
          and ld.deleted_at is null and ld.billing_decision='facturable'
      );
  else
    select round(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0),2) into v_quote
    from public.quotes q
    where q.company_id=v_work.company_id and q.deleted_at is null
      and q.status in ('Aceptado','Ejecutado en cliente')
      and (q.id=v_work.quote_id or q.work_order_id=v_work.id)
    order by case when q.id=v_work.quote_id then 0 else 1 end, q.issue_date desc nulls last, q.created_at desc nulls last, q.id desc
    limit 1;
  end if;

  select round(coalesce(sum(total_price),0),2) into v_additional
  from (
    select total_price from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source='additional' and contributes_to_sale
    union all select total_price from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id and source='additional' and contributes_to_sale
    union all select total_price from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source='additional' and contributes_to_sale
  ) additional_entries;

  if v_work.warranty then
    v_sale := round(v_quote + v_additional,2);
  elsif exists(select 1 from public.quotes q where q.company_id=v_work.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') and (q.id=v_work.quote_id or q.work_order_id=v_work.id)) then
    v_sale := round(v_quote + v_additional,2);
  else
    select round(coalesce(sum(total_price),0),2) into v_operational_sale from (
      select total_price from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
      union all select total_price from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
      union all select total_price from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source <> 'quote' and contributes_to_sale
    ) operational_entries;
    v_sale := v_operational_sale;
  end if;

  v_billable := v_sale > 0;
  v_status := case when v_work.economic_status='pendiente_validacion' then 'pendiente_validacion'
                  when v_work.warranty and not v_billable then 'garantia'
                  when not v_billable then 'no_facturable'
                  when v_work.status in ('Finalizado tecnicamente','Enviado','Cerrado') and v_work.economic_status='facturado' then 'facturado'
                  else 'pendiente_facturar' end;

  update public.work_orders set economic_status=v_status, billable=v_billable,
    quoted_sale_amount=round(coalesce(v_quote,0),2), additional_sale_amount=round(coalesce(v_additional,0),2),
    sale_amount=round(v_sale,2), real_cost_amount=round(v_real_cost,2),
    margin_amount=round(v_sale-v_real_cost,2), estimated_sale_amount=round(v_sale,2),
    estimated_margin_amount=round(v_sale-v_real_cost,2), updated_at=now()
  where id=v_work.id returning * into v_work;
  return v_work;
end;
$$;

create or replace function public.dmp_set_work_order_billing_decision(
  p_work_order_id uuid, p_concept_type text, p_concept_id uuid, p_billing_decision text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_old text;
  v_company uuid;
  v_invoice_status text;
  v_new jsonb;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then
    raise exception 'permiso: solo SAT, Gerencia u Oficina puede decidir la facturacion de garantia';
  end if;
  if p_concept_type not in ('planned_material','quote_line') then raise exception 'concepto: tipo no valido'; end if;
  if p_billing_decision not in ('cubierto_garantia','facturable') then raise exception 'facturacion: decision no valida'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not v_work.warranty then raise exception 'garantia: la decision solo aplica a partes en garantia'; end if;

  select i.status into v_invoice_status
  from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id
  where l.work_order_id=v_work.id and l.deleted_at is null
  order by i.created_at desc limit 1;
  if v_invoice_status is not null then
    if v_invoice_status='borrador' then raise exception 'factura: existe un borrador activo; revisalo antes de cambiar la cobertura'; end if;
    raise exception 'factura: el parte ya tiene una factura y no admite cambios de cobertura';
  end if;

  if p_concept_type='planned_material' then
    select company_id,billing_decision into v_company,v_old from public.work_order_planned_material_decisions
    where work_order_id=v_work.id and quote_line_id=p_concept_id and deleted_at is null for update;
    if v_company is null then raise exception 'concepto: decision de material previsto no encontrada'; end if;
    if v_company<>v_work.company_id then raise exception 'empresa: concepto fuera del tenant'; end if;
    update public.work_order_planned_material_decisions set billing_decision=p_billing_decision, updated_at=now()
    where work_order_id=v_work.id and quote_line_id=p_concept_id and deleted_at is null;
  else
    select company_id,billing_decision into v_company,v_old from public.work_order_quote_line_decisions
    where work_order_id=v_work.id and quote_line_id=p_concept_id and deleted_at is null for update;
    if v_company is null then raise exception 'concepto: decision de linea prevista no encontrada'; end if;
    if v_company<>v_work.company_id then raise exception 'empresa: concepto fuera del tenant'; end if;
    update public.work_order_quote_line_decisions set billing_decision=p_billing_decision, updated_at=now()
    where work_order_id=v_work.id and quote_line_id=p_concept_id and deleted_at is null;
  end if;

  v_new := jsonb_build_object('work_order_id',v_work.id,'concept_type',p_concept_type,'concept_id',p_concept_id,'billing_decision',p_billing_decision);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
  values(v_work.company_id,case when p_concept_type='planned_material' then 'work_order_planned_material_decisions' else 'work_order_quote_line_decisions' end,p_concept_id,'OPERATIONAL_UPDATE',v_actor.id,jsonb_build_object('billing_decision',v_old),v_new);
  perform public.dmp_recalculate_work_order_economics(v_work.id);
  return p_concept_id;
end;
$$;

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb;
begin
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Finalizado tecnicamente','Enviado','Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico',v_work.status; end if;
  if not (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or (public.has_any_role(array['Tecnico']) and exists(select 1 from public.work_order_assignments a where a.work_order_id=v_work.id and a.technician_id=v_actor.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;
  if v_work.quote_id is not null and exists(select 1 from public.quote_lines ql where ql.quote_id=v_work.quote_id and ql.deleted_at is null and ql.line_type not in ('fee','discount','labor') and not exists(select 1 from public.work_order_planned_material_decisions md where md.work_order_id=v_work.id and md.quote_line_id=ql.id and md.deleted_at is null) and not exists(select 1 from public.work_order_quote_line_decisions ld where ld.work_order_id=v_work.id and ld.quote_line_id=ql.id and ld.deleted_at is null)) then raise exception 'cierre incompleto: quedan conceptos previstos sin resolver'; end if;
  if exists(select 1 from public.checks where work_order_id=v_work.id and deleted_at is null and status<>'Realizado') then raise exception 'cierre incompleto: quedan checks sin finalizar'; end if;
  v_old:=to_jsonb(v_work);
  update public.work_orders set status='Finalizado tecnicamente', economic_status='pendiente_validacion', office_validation_status='pending', office_validation_reason=null, office_validated_at=null, office_validated_by=null, finished_at=coalesce(finished_at,now()), sent_at=null, updated_by=v_actor.id, updated_at=now() where id=v_work.id returning * into v_work;
  perform public.dmp_recalculate_work_order_economics(v_work.id);
  select * into v_work from public.work_orders where id=v_work.id;
  update public.work_order_assignments set status='Finalizado',updated_at=now() where work_order_id=v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico pendiente de oficina'),false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'TECHNICAL_FINALIZE_PENDING_OFFICE',v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end;
$$;

create or replace function public.dmp_guided_billing_eligible(p_work_order_id uuid)
returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from public.work_orders w where w.id=p_work_order_id and w.deleted_at is null
    and w.economic_status in ('pendiente_facturar','pendiente_validacion')
    and coalesce(w.billable,false) and coalesce(w.sale_amount,0)>0
    and ((w.sat_review_status='approved' and w.sat_review_destination='facturacion') or (w.sat_review_status='approved' and w.sat_review_destination='comercial' and w.commercial_review_status='approved') or (w.office_validation_status='validated' and w.economic_status='pendiente_facturar')));
$$;

create or replace function public.dmp_review_work_order_office(p_work_order_id uuid, p_decision text, p_reason text)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para validar partes en oficina'; end if;
  if p_decision not in ('validated','rejected') or trim(coalesce(p_reason,''))='' then raise exception 'validacion: decision o motivo no valido'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id); v_old:=to_jsonb(v_work);
  if v_work.status<>'Finalizado tecnicamente' or v_work.office_validation_status not in ('pending','rejected') then raise exception 'validacion: el parte no esta pendiente de validacion de oficina'; end if;
  if p_decision='rejected' then
    update public.work_orders set status='Devuelto por SAT',economic_status='pendiente',office_validation_status='rejected',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,finished_at=null,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    update public.work_order_assignments set status='Asignado',updated_at=now() where work_order_id=v_work.id and deleted_at is null and status='Finalizado';
  else
    update public.work_orders set economic_status='pendiente_facturar',office_validation_status='validated',office_validation_reason=trim(p_reason),office_validated_at=now(),office_validated_by=v_actor.id,updated_by=v_actor.id,updated_at=now() where id=v_work.id returning * into v_work;
    perform public.dmp_recalculate_work_order_economics(v_work.id);
    select * into v_work from public.work_orders where id=v_work.id;
    if v_work.quote_id is not null and exists(select 1 from public.quotes where id=v_work.quote_id and deleted_at is null and status='Aceptado') then perform public.dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente','Validado por oficina: '||trim(p_reason),null,v_actor.id); end if;
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
  values(v_work.company_id,'work_orders',v_work.id,case when p_decision='validated' then 'OFFICE_VALIDATE' else 'OFFICE_REJECT' end,v_actor.id,v_old,to_jsonb(v_work));
  return v_work;
end;
$$;

create or replace function public.dmp_prepare_invoice_from_work_order(p_work_order_id uuid,p_due_date date default null,p_notes text default null,p_tax_rate numeric default 21)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_existing uuid; v_existing_status text; v_id uuid; v_tax numeric:=coalesce(p_tax_rate,0); v_line record; v_attached boolean:=false; v_sale numeric; v_subtotal numeric; v_tax_amount numeric; v_total numeric; v_line_count integer:=0; v_has_detail boolean:=false; v_notes text:=nullif(trim(p_notes),'');
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para preparar facturas'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  select i.id,i.status into v_existing,v_existing_status from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=v_work.id and l.deleted_at is null for update;
  if v_existing is not null then if v_existing_status='borrador' then return v_existing; end if; raise exception 'factura: el parte ya esta asociado a una factura'; end if;
  if not public.dmp_guided_billing_eligible(v_work.id) then raise exception 'factura: el parte no esta listo para facturacion'; end if;
  if v_tax<0 then raise exception 'factura: IVA no valido'; end if;
  v_sale:=round(coalesce(v_work.sale_amount,0),2);
  if v_sale<=0 then raise exception 'factura: no existe importe facturable positivo'; end if;
  insert into public.invoices(company_id,code,client_id,status,issue_date,due_date,subtotal,tax_rate,tax_amount,total_amount,notes,created_by,updated_by) values(v_work.company_id,null,v_work.client_id,'borrador',current_date,p_due_date,0,v_tax,0,0,nullif(trim(p_notes),''),v_actor.id,v_actor.id) returning id into v_id;
  for v_line in select ql.description,ql.quantity,ql.unit_price,ql.discount_percent,coalesce(nullif(ql.total_price,0),nullif(ql.total,0),round(ql.quantity*ql.unit_price*(1-ql.discount_percent/100),2)) subtotal from public.quote_lines ql join public.quotes q on q.id=ql.quote_id and q.company_id=ql.company_id and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente') where ql.quote_id=v_work.quote_id and ql.company_id=v_work.company_id and ql.deleted_at is null and (not v_work.warranty or exists(select 1 from public.work_order_planned_material_decisions md where md.work_order_id=v_work.id and md.quote_line_id=ql.id and md.deleted_at is null and md.billing_decision='facturable') or exists(select 1 from public.work_order_quote_line_decisions ld where ld.work_order_id=v_work.id and ld.quote_line_id=ql.id and ld.deleted_at is null and ld.billing_decision='facturable')) order by ql.position loop
    if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),coalesce(v_line.discount_percent,0),round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
  end loop;
  for v_line in select description,used_quantity quantity,unit_price,total_price subtotal from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and exists(select 1 from public.quotes q where q.id=v_work.quote_id and q.company_id=v_work.company_id and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente')) and source='additional' and contributes_to_sale loop
    if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,coalesce(nullif(trim(v_line.description),''),'Material adicional'),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
  end loop;
  for v_line in select coalesce(nullif(trim(description),''),'Mano de obra adicional') description,round(duration_minutes::numeric/60,3) quantity,hourly_price unit_price,total_price subtotal from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id and exists(select 1 from public.quotes q where q.id=v_work.quote_id and q.company_id=v_work.company_id and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente')) and source='additional' and contributes_to_sale loop
    if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
  end loop;
  for v_line in select coalesce(nullif(trim(description),''),'Coste adicional') description,quantity,unit_price,total_price subtotal from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and exists(select 1 from public.quotes q where q.id=v_work.quote_id and q.company_id=v_work.company_id and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente')) and source='additional' and contributes_to_sale loop
    if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
  end loop;
  if not exists(select 1 from public.quotes q where q.id=v_work.quote_id and q.company_id=v_work.company_id and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente')) then
    for v_line in select coalesce(nullif(trim(m.description),''),mat.description,'Material') description,m.used_quantity quantity,m.unit_price,m.total_price subtotal from public.work_order_materials m left join public.materials mat on mat.id=m.material_id and mat.company_id=m.company_id where m.company_id=v_work.company_id and m.work_order_id=v_work.id and m.deleted_at is null loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(description),''),'Mano de obra tecnico') description,round(duration_minutes::numeric/60,3) quantity,hourly_price unit_price,total_price subtotal from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(description),''),'Servicio adicional') description,quantity,unit_price,total_price subtotal from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
  end if;
  select coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0) into v_subtotal,v_tax_amount,v_total from public.invoice_work_orders where invoice_id=v_id and deleted_at is null;
  if not v_has_detail or v_subtotal<=0 then delete from public.invoice_work_orders where invoice_id=v_id and deleted_at is null; delete from public.invoices where id=v_id; raise exception 'factura: no existe desglose facturable positivo'; end if;
  if round(v_subtotal,2)<>v_sale then delete from public.invoice_work_orders where invoice_id=v_id and deleted_at is null; delete from public.invoices where id=v_id; raise exception 'factura: el desglose facturable no coincide con el resumen economico'; end if;
  update public.invoices set notes=case when v_notes is not null then v_notes else notes end,subtotal=v_subtotal,tax_amount=v_tax_amount,total_amount=v_total,updated_at=now(),updated_by=v_actor.id where id=v_id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'invoices',v_id,'INVOICE_DRAFT_CREATE',v_actor.id,null,jsonb_build_object('work_order_id',v_work.id,'line_count',v_line_count,'sale_amount',v_sale,'desglose_real',v_has_detail));
  return v_id;
end;
$$;

create or replace view public.v_work_order_economic_summary with (security_invoker=true) as
with mat as (select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) material_cost from public.work_order_materials where deleted_at is null group by company_id,work_order_id),
tim as (select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) time_cost from public.work_order_time_entries group by company_id,work_order_id),
aux as (select company_id,work_order_id,round(coalesce(sum(total_cost),0),2) auxiliary_cost,round(coalesce(sum(total_cost) filter(where cost_type='desplazamiento'),0),2) travel_cost,round(coalesce(sum(total_cost) filter(where cost_type='taller_movil'),0),2) mobile_workshop_cost,round(coalesce(sum(total_cost) filter(where cost_type='plataforma_elevadora'),0),2) platform_cost,round(coalesce(sum(total_cost) filter(where cost_type='coste_externo'),0),2) external_cost,round(coalesce(sum(total_price) filter(where source='additional' and contributes_to_sale),0),2) additional_sale_amount from public.work_order_cost_entries where deleted_at is null group by company_id,work_order_id),
quoted as (select distinct on (wo.company_id,wo.id) wo.company_id,wo.id work_order_id,round(coalesce(q.taxable_base,q.subtotal_sale,q.subtotal,0),2) quoted_sale_amount from public.work_orders wo join public.quotes q on q.company_id=wo.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') and (q.id=wo.quote_id or q.work_order_id=wo.id) order by wo.company_id,wo.id,case when q.id=wo.quote_id then 0 else 1 end,q.updated_at desc,q.id desc),
base as (select wo.*,c.legal_name client_name,s.name site_name,e.code equipment_code,coalesce(mat.material_cost,0) material_cost,coalesce(tim.time_cost,0) time_cost,coalesce(aux.auxiliary_cost,0) auxiliary_cost,coalesce(aux.travel_cost,0) travel_cost,coalesce(aux.mobile_workshop_cost,0) mobile_workshop_cost,coalesce(aux.platform_cost,0) platform_cost,coalesce(aux.external_cost,0) external_cost,case when wo.status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(wo.quoted_sale_amount,0) else coalesce(quoted.quoted_sale_amount,0) end quoted_calc,case when wo.status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(wo.additional_sale_amount,0) else coalesce(aux.additional_sale_amount,0) end additional_calc from public.work_orders wo left join public.clients c on c.id=wo.client_id and c.company_id=wo.company_id left join public.sites s on s.id=wo.site_id and s.company_id=wo.company_id left join public.equipment e on e.id=wo.main_equipment_id and e.company_id=wo.company_id left join mat on mat.company_id=wo.company_id and mat.work_order_id=wo.id left join tim on tim.company_id=wo.company_id and tim.work_order_id=wo.id left join aux on aux.company_id=wo.company_id and aux.work_order_id=wo.id left join quoted on quoted.company_id=wo.company_id and quoted.work_order_id=wo.id where wo.deleted_at is null),
calc as (select b.*,case when b.status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(b.sale_amount,0) else case when b.warranty then 0 else b.quoted_calc+b.additional_calc end end sale_calc from base b)
select id,company_id,code,title,status,type,scheduled_date,client_id,client_name,site_id,site_name,main_equipment_id,equipment_code,economic_status,billable,warranty,material_cost,time_cost,auxiliary_cost,travel_cost,mobile_workshop_cost,platform_cost,external_cost,case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(real_cost_amount,0) else round(material_cost+time_cost+auxiliary_cost,2) end real_cost_amount,sale_calc estimated_sale_amount,case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then margin_amount else round(sale_calc-(material_cost+time_cost+auxiliary_cost),2) end estimated_margin_amount,invoiced_amount,paid_amount,sale_calc sale_amount,case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then margin_amount else round(sale_calc-(material_cost+time_cost+auxiliary_cost),2) end margin_amount,case when sale_calc>0 then round((sale_calc-(case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(real_cost_amount,0) else material_cost+time_cost+auxiliary_cost end))/sale_calc*100,2) else null end margin_percentage,case when status in ('Finalizado tecnicamente','Enviado','Cerrado') then coalesce(real_cost_amount,0) else round(material_cost+time_cost+auxiliary_cost,2) end real_cost,quoted_calc quoted_sale_amount,additional_calc additional_sale_amount,quote_id from calc;

revoke all on function public.dmp_recalculate_work_order_economics(uuid) from public,anon,authenticated;
revoke all on function public.dmp_set_work_order_billing_decision(uuid,text,uuid,text) from public,anon;
grant execute on function public.dmp_set_work_order_billing_decision(uuid,text,uuid,text) to authenticated;
revoke all on function public.dmp_guided_billing_eligible(uuid) from public,anon,authenticated;
grant execute on function public.dmp_guided_billing_eligible(uuid) to authenticated;
revoke all on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) from public,anon;
grant execute on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) to authenticated;

commit;
