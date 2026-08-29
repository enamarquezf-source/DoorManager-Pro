-- DoorManager Pro - elimina la segunda validacion de Oficina del routing moderno.
-- El flujo legacy conserva office_validation_status='validated'.

begin;

create or replace function public.dmp_guided_billing_eligible(p_work_order_id uuid)
returns boolean language sql security definer set search_path=public as $$
  select exists (
    select 1
    from public.work_orders w
    where w.id=p_work_order_id
      and w.deleted_at is null
      and w.economic_status in ('pendiente_facturar','pendiente_validacion')
      and not coalesce(w.warranty,false)
      and coalesce(w.billable,true)
      and (
        (w.sat_review_status='approved' and w.sat_review_destination='facturacion')
        or (w.sat_review_status='approved' and w.sat_review_destination='comercial' and w.commercial_review_status='approved')
        or (w.office_validation_status='validated' and w.economic_status='pendiente_facturar')
      )
  );
$$;

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
  if not public.dmp_guided_billing_eligible(v_work.id) then raise exception 'factura: el parte no esta listo para facturacion'; end if;
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

create or replace function public.dmp_update_invoice_draft(p_invoice_id uuid,p_lines jsonb,p_due_date date default null,p_notes text default null,p_tax_rate numeric default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_invoice public.invoices; v_line jsonb; v_qty numeric; v_price numeric; v_discount numeric; v_tax numeric; v_line_tax numeric; v_subtotal numeric; v_tax_amount numeric; v_total numeric; v_work_id uuid; v_source_work_id uuid;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para editar borradores'; end if;
  if coalesce(jsonb_typeof(p_lines),'')<>'array' then raise exception 'factura: las lineas deben ser un array'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status<>'borrador' then raise exception 'factura: solo se pueden editar borradores'; end if;
  select work_order_id into v_source_work_id from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null and work_order_id is not null limit 1;
  v_tax:=coalesce(p_tax_rate,v_invoice.tax_rate);
  if v_tax<0 then raise exception 'factura: IVA no valido'; end if;
  delete from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if trim(coalesce(v_line->>'description',''))='' then raise exception 'factura: cada linea necesita descripcion'; end if;
    v_qty:=coalesce(nullif(v_line->>'quantity','')::numeric,1); v_price:=coalesce(nullif(v_line->>'unit_price','')::numeric,0); v_discount:=coalesce(nullif(v_line->>'discount','')::numeric,0); v_line_tax:=coalesce(nullif(v_line->>'tax_rate','')::numeric,coalesce(p_tax_rate,v_invoice.tax_rate));
    if v_qty<0 or v_price<0 or v_discount<0 or v_discount>100 or v_line_tax<0 then raise exception 'factura: importe, cantidad, descuento o IVA no valido'; end if;
    v_work_id:=nullif(v_line->>'work_order_id','')::uuid;
    if v_work_id is not null then
      if not public.dmp_guided_billing_eligible(v_work_id) or not exists(select 1 from public.work_orders w where w.id=v_work_id and w.company_id=v_invoice.company_id) then raise exception 'factura: parte asociado no valido para este borrador'; end if;
      if exists(select 1 from public.invoice_work_orders l where l.work_order_id=v_work_id and l.deleted_at is null and l.invoice_id<>v_invoice.id) then raise exception 'factura: el parte ya pertenece a otra factura activa'; end if;
    end if;
    v_subtotal:=round(v_qty*v_price*(1-v_discount/100),2); v_tax_amount:=round(v_subtotal*v_line_tax/100,2); v_total:=round(v_subtotal+v_tax_amount,2);
    insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(v_invoice.company_id,v_invoice.id,v_work_id,trim(v_line->>'description'),v_qty,v_price,v_discount,v_subtotal,v_line_tax,v_tax_amount,v_total);
  end loop;
  if v_source_work_id is not null and not exists(select 1 from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null and work_order_id=v_source_work_id) then raise exception 'factura: el borrador debe conservar su parte asociado'; end if;
  select coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0) into v_subtotal,v_tax_amount,v_total from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null;
  update public.invoices set due_date=p_due_date,notes=nullif(trim(p_notes),''),tax_rate=coalesce(p_tax_rate,tax_rate),subtotal=v_subtotal,tax_amount=v_tax_amount,total_amount=v_total,updated_by=v_actor.id,updated_at=now() where id=v_invoice.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_invoice.company_id,'invoices',v_invoice.id,'INVOICE_DRAFT_UPDATE',v_actor.id,to_jsonb(v_invoice),jsonb_build_object('subtotal',v_subtotal,'tax_amount',v_tax_amount,'total_amount',v_total));
end $$;

create or replace function public.dmp_issue_invoice(p_invoice_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_invoice public.invoices; v_work public.work_orders; v_company public.companies; v_client public.clients; v_site public.sites; v_quote public.quotes; v_id uuid; v_base text; v_next integer; v_subtotal numeric; v_tax numeric; v_total numeric; v_invalid integer; v_snapshot jsonb;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para emitir facturas'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status<>'borrador' then raise exception 'factura: solo se pueden emitir borradores'; end if;
  select count(*) filter(where total_amount<=0 or subtotal<0 or tax_amount<0),coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0) into v_invalid,v_subtotal,v_tax,v_total from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null;
  if not exists(select 1 from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null) or v_invalid>0 or v_total<=0 then raise exception 'factura: el borrador necesita al menos una linea valida y un total mayor que cero'; end if;
  if exists(select 1 from public.invoice_work_orders l left join public.work_orders w on w.id=l.work_order_id where l.invoice_id=v_invoice.id and l.deleted_at is null and l.work_order_id is not null and (w.id is null or w.company_id<>v_invoice.company_id or not public.dmp_guided_billing_eligible(w.id))) then raise exception 'factura: existe un parte asociado no valido'; end if;
  select w.* into v_work from public.invoice_work_orders l join public.work_orders w on w.id=l.work_order_id where l.invoice_id=v_invoice.id and l.deleted_at is null and l.work_order_id is not null order by l.id limit 1;
  select * into v_client from public.clients where id=v_work.client_id; select * into v_site from public.sites where id=v_work.site_id; select * into v_quote from public.quotes where id=v_work.quote_id; select * into v_company from public.companies where id=v_invoice.company_id;
  v_snapshot:=jsonb_build_object('emitter',jsonb_build_object('name',v_company.name,'trade_name',v_company.trade_name,'tax_id',v_company.tax_id,'address',v_company.address,'postal_code',v_company.postal_code,'city',v_company.city,'province',v_company.province,'country',v_company.country,'phone',v_company.phone,'email',v_company.email,'website',v_company.website),'client',jsonb_build_object('legal_name',v_client.legal_name,'trade_name',v_client.trade_name,'tax_id',v_client.tax_id,'address',v_client.address,'postal_code',v_client.postal_code,'city',v_client.city,'province',v_client.province,'country',v_client.country,'phone',v_client.phone,'email',v_client.email),'work',jsonb_build_object('code',v_work.code,'title',v_work.title,'site_name',v_site.name,'site_code',v_site.code,'quote_code',v_quote.code),'lines',coalesce((select jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity,'unit_price',l.unit_price,'discount',l.discount,'subtotal',l.subtotal,'tax_rate',l.tax_rate,'tax_amount',l.tax_amount,'total_amount',l.total_amount) order by l.id) from public.invoice_work_orders l where l.invoice_id=v_invoice.id and l.deleted_at is null),'[]'::jsonb),'totals',jsonb_build_object('subtotal',v_subtotal,'tax_rate',v_invoice.tax_rate,'tax_amount',v_tax,'total_amount',v_total,'issue_date',current_date,'due_date',v_invoice.due_date,'notes',v_invoice.notes));
  v_base:='FAC-'||to_char(current_date,'YYYY-'); perform pg_advisory_xact_lock(hashtextextended(v_invoice.company_id::text||':invoice:'||v_base,0));
  select coalesce(max(substring(code from length(v_base)+1)::integer),0)+1 into v_next from public.invoices where company_id=v_invoice.company_id and code like v_base||'%' and substring(code from length(v_base)+1)~'^[0-9]+$';
  v_id:=v_invoice.id; update public.invoices set code=v_base||lpad(v_next::text,6,'0'),status='emitida',issue_date=current_date,subtotal=v_subtotal,tax_amount=v_tax,total_amount=v_total,fiscal_snapshot=v_snapshot,updated_by=v_actor.id,updated_at=now() where id=v_id; update public.work_orders w set invoiced_amount=l.subtotal,paid_amount=0,economic_status='facturado',updated_by=v_actor.id,updated_at=now() from public.invoice_work_orders l where l.invoice_id=v_id and l.work_order_id=w.id and l.deleted_at is null; insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_invoice.company_id,'invoices',v_id,'INVOICE_ISSUE',v_actor.id,to_jsonb(v_invoice),jsonb_build_object('code',v_base||lpad(v_next::text,6,'0'),'subtotal',v_subtotal,'tax_amount',v_tax,'total_amount',v_total,'fiscal_snapshot',true));
  return v_id;
end $$;

revoke all on function public.dmp_guided_billing_eligible(uuid) from public,anon,authenticated;
revoke all on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) from public,anon;
grant execute on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) to authenticated;
revoke all on function public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric) from public,anon;
grant execute on function public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric) to authenticated;
revoke all on function public.dmp_issue_invoice(uuid) from public,anon;
grant execute on function public.dmp_issue_invoice(uuid) to authenticated;

commit;
