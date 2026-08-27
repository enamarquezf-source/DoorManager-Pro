-- DoorManager Pro - hace preparar factura idempotente y conserva el origen economico.
-- Reutiliza snapshots persistidos; no convierte estimaciones en importes fiscales.

begin;

create or replace function public.dmp_prepare_invoice_from_work_order(p_work_order_id uuid,p_due_date date default null,p_notes text default null,p_tax_rate numeric default 21)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_existing uuid; v_existing_status text; v_id uuid;
  v_tax numeric:=coalesce(p_tax_rate,0); v_line record; v_line_count integer:=0; v_attached boolean:=false; v_sale numeric; v_subtotal numeric; v_tax_amount numeric; v_total numeric; v_detail_total numeric; v_has_detail boolean:=false; v_notes text;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para preparar facturas'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  select i.id,i.status into v_existing,v_existing_status from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=v_work.id and l.deleted_at is null for update;
  if v_existing is not null then
    if v_existing_status='borrador' then return v_existing; end if;
    raise exception 'factura: el parte ya esta asociado a una factura';
  end if;
  if v_work.office_validation_status<>'validated' or v_work.economic_status<>'pendiente_facturar' then raise exception 'factura: el parte debe estar validado por oficina y pendiente de facturar'; end if;
  if coalesce(v_work.warranty,false) or not coalesce(v_work.billable,true) then raise exception 'factura: las garantias y partes no facturables no pueden facturarse'; end if;
  if v_tax<0 then raise exception 'factura: IVA no valido'; end if;
  v_sale:=case when coalesce(v_work.sale_amount,0)>0 then round(v_work.sale_amount,2) else 0 end;
  insert into public.invoices(company_id,code,client_id,status,issue_date,due_date,subtotal,tax_rate,tax_amount,total_amount,notes,created_by,updated_by)
  values(v_work.company_id,null,v_work.client_id,'borrador',current_date,p_due_date,0,v_tax,0,0,nullif(trim(p_notes),''),v_actor.id,v_actor.id) returning id into v_id;

  if exists(select 1 from public.quotes q join public.quote_lines ql on ql.quote_id=q.id and ql.company_id=q.company_id and ql.deleted_at is null where q.id=v_work.quote_id and q.company_id=v_work.company_id and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente')) then
    for v_line in select ql.description,ql.quantity,ql.unit_price,ql.discount_percent,coalesce(nullif(ql.total_price,0),nullif(ql.total,0),round(ql.quantity*ql.unit_price*(1-ql.discount_percent/100),2)) subtotal from public.quote_lines ql join public.quotes q on q.id=ql.quote_id and q.company_id=ql.company_id where ql.quote_id=v_work.quote_id and ql.company_id=v_work.company_id and ql.deleted_at is null and q.deleted_at is null and q.status in('Aceptado','Ejecutado en cliente') order by ql.position loop
      if coalesce(v_line.subtotal,0)>0 then
        insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),coalesce(v_line.discount_percent,0),round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2));
        v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true;
      end if;
    end loop;
    for v_line in select m.description, m.used_quantity quantity, m.unit_price, m.total_price subtotal from public.work_order_materials m where m.company_id=v_work.company_id and m.work_order_id=v_work.id and m.deleted_at is null and m.source='additional' and m.contributes_to_sale loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,null,coalesce(nullif(trim(v_line.description),''),'Material adicional'),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(t.description),''),'Mano de obra adicional') description,round(t.duration_minutes::numeric/60,3) quantity,t.hourly_price unit_price,t.total_price subtotal from public.work_order_time_entries t where t.company_id=v_work.company_id and t.work_order_id=v_work.id and t.source='additional' and t.contributes_to_sale loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,null,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(c.description),''),'Coste adicional') description,c.quantity,c.unit_price,c.total_price subtotal from public.work_order_cost_entries c where c.company_id=v_work.company_id and c.work_order_id=v_work.id and c.deleted_at is null and c.source='additional' and c.contributes_to_sale loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,null,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
  else
    for v_line in select coalesce(nullif(trim(m.description),''),mat.description,'Material') description,m.used_quantity quantity,m.unit_price,m.total_price subtotal from public.work_order_materials m left join public.materials mat on mat.id=m.material_id and mat.company_id=m.company_id where m.company_id=v_work.company_id and m.work_order_id=v_work.id and m.deleted_at is null loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(t.description),''),'Mano de obra tecnico') description,round(t.duration_minutes::numeric/60,3) quantity,t.hourly_price unit_price,t.total_price subtotal from public.work_order_time_entries t where t.company_id=v_work.company_id and t.work_order_id=v_work.id loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(c.description),''),'Servicio adicional') description,c.quantity,c.unit_price,c.total_price subtotal from public.work_order_cost_entries c where c.company_id=v_work.company_id and c.work_order_id=v_work.id and c.deleted_at is null loop
      if coalesce(v_line.subtotal,0)>0 then insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,case when not v_attached then v_work.id else null end,trim(v_line.description),coalesce(v_line.quantity,1),coalesce(v_line.unit_price,0),0,round(v_line.subtotal,2),v_tax,round(v_line.subtotal*v_tax/100,2),round(v_line.subtotal*(1+v_tax/100),2)); v_attached:=true; v_line_count:=v_line_count+1; v_has_detail:=true; end if;
    end loop;
  end if;

  select coalesce(sum(subtotal),0) into v_detail_total from public.invoice_work_orders where invoice_id=v_id and deleted_at is null;
  if not v_has_detail or (v_sale>0 and round(v_detail_total,2)<>v_sale) then
    delete from public.invoice_work_orders where invoice_id=v_id and deleted_at is null;
    v_notes:=concat_ws(E'\n',nullif(trim(p_notes),''),'ADVERTENCIA: El importe registrado no dispone de desglose economico completo. Revisa las lineas antes de emitir.');
    insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_work.company_id,v_id,v_work.id,'Trabajo '||v_work.code||' - '||v_work.title,1,v_sale,0,v_sale,v_tax,round(v_sale*v_tax/100,2),round(v_sale*(1+v_tax/100),2));
    v_detail_total:=v_sale;
  end if;
  select coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0) into v_subtotal,v_tax_amount,v_total from public.invoice_work_orders where invoice_id=v_id and deleted_at is null;
  update public.invoices set notes=case when v_notes is not null then v_notes else notes end,subtotal=v_subtotal,tax_amount=v_tax_amount,total_amount=v_total,updated_at=now(),updated_by=v_actor.id where id=v_id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'invoices',v_id,'INVOICE_DRAFT_CREATE',v_actor.id,null,jsonb_build_object('work_order_id',v_work.id,'line_count',v_line_count,'sale_amount',v_work.sale_amount,'estimated_sale_amount',v_work.estimated_sale_amount,'desglose_real',v_has_detail));
  return v_id;
end $$;

revoke all on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) from public,anon;
grant execute on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) to authenticated;

commit;
