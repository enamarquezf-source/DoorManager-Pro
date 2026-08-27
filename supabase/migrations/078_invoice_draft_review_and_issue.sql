-- DoorManager Pro - separa preparar, revisar y emitir facturas.
-- Los borradores no consumen numeracion ni alteran el parte o los cobros.

begin;

alter table public.invoices alter column code drop not null;
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in('borrador','emitida','parcialmente_cobrada','cobrada','cancelada'));

alter table public.invoice_work_orders alter column work_order_id drop not null;
alter table public.invoice_work_orders add column if not exists quantity numeric(12,3) check(quantity>=0);
alter table public.invoice_work_orders add column if not exists unit_price numeric(12,2) check(unit_price>=0);
alter table public.invoice_work_orders add column if not exists discount numeric(6,2) check(discount>=0 and discount<=100);
update public.invoice_work_orders set quantity=coalesce(quantity,1),unit_price=coalesce(unit_price,subtotal),discount=coalesce(discount,0) where quantity is null or unit_price is null or discount is null;
alter table public.invoice_work_orders alter column quantity set default 1;
alter table public.invoice_work_orders alter column quantity set not null;
alter table public.invoice_work_orders alter column unit_price set default 0;
alter table public.invoice_work_orders alter column unit_price set not null;
alter table public.invoice_work_orders alter column discount set default 0;
alter table public.invoice_work_orders alter column discount set not null;

alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log add constraint audit_log_operation_check check (operation in (
  'INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE',
  'TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_DRAFT_CREATE',
  'INVOICE_DRAFT_UPDATE','INVOICE_ISSUE','PAYMENT_RECORD','MATERIAL_CREATE'
));

create or replace function public.dmp_prepare_invoice_from_work_order(p_work_order_id uuid,p_due_date date default null,p_notes text default null,p_tax_rate numeric default 21)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_id uuid; v_sale numeric;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para preparar facturas'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.office_validation_status<>'validated' or v_work.economic_status<>'pendiente_facturar' then raise exception 'factura: el parte debe estar validado por oficina y pendiente de facturar'; end if;
  if coalesce(v_work.warranty,false) or not coalesce(v_work.billable,true) then raise exception 'factura: las garantias y partes no facturables no pueden facturarse'; end if;
  if coalesce(p_tax_rate,0)<0 then raise exception 'factura: IVA no valido'; end if;
  if exists(select 1 from public.invoice_work_orders where work_order_id=v_work.id and deleted_at is null) then raise exception 'factura: el parte ya tiene un borrador o factura activa'; end if;
  v_sale:=case when coalesce(v_work.sale_amount,0)>0 then round(v_work.sale_amount,2) else 0 end;
  insert into public.invoices(company_id,code,client_id,status,issue_date,due_date,subtotal,tax_rate,tax_amount,total_amount,notes,created_by,updated_by)
  values(v_work.company_id,null,v_work.client_id,'borrador',current_date,p_due_date,v_sale,coalesce(p_tax_rate,0),round(v_sale*coalesce(p_tax_rate,0)/100,2),round(v_sale*(1+coalesce(p_tax_rate,0)/100),2),nullif(trim(p_notes),''),v_actor.id,v_actor.id) returning id into v_id;
  insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount)
  values(v_work.company_id,v_id,v_work.id,v_work.code||' · '||v_work.title,1,v_sale,0,v_sale,coalesce(p_tax_rate,0),round(v_sale*coalesce(p_tax_rate,0)/100,2),round(v_sale*(1+coalesce(p_tax_rate,0)/100),2));
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'invoices',v_id,'INVOICE_DRAFT_CREATE',v_actor.id,null,jsonb_build_object('work_order_id',v_work.id,'estimated_sale_amount',v_work.estimated_sale_amount,'suggested_sale_amount',v_sale));
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
      if not exists(select 1 from public.work_orders w where w.id=v_work_id and w.company_id=v_invoice.company_id and w.deleted_at is null and w.office_validation_status='validated' and w.economic_status='pendiente_facturar' and not coalesce(w.warranty,false) and coalesce(w.billable,true)) then raise exception 'factura: parte asociado no valido para este borrador'; end if;
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
declare v_actor public.profiles:=public.dmp024_active_profile(); v_invoice public.invoices; v_id uuid; v_base text; v_next integer; v_subtotal numeric; v_tax numeric; v_total numeric; v_invalid integer;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para emitir facturas'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status<>'borrador' then raise exception 'factura: solo se pueden emitir borradores'; end if;
  select count(*) filter(where total_amount<=0 or subtotal<0 or tax_amount<0),coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0) into v_invalid,v_subtotal,v_tax,v_total from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null;
  if not exists(select 1 from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null) or v_invalid>0 or v_total<=0 then raise exception 'factura: el borrador necesita al menos una linea valida y un total mayor que cero'; end if;
  if exists(select 1 from public.invoice_work_orders l left join public.work_orders w on w.id=l.work_order_id where l.invoice_id=v_invoice.id and l.deleted_at is null and (l.work_order_id is not null and (w.id is null or w.company_id<>v_invoice.company_id or w.office_validation_status<>'validated' or w.economic_status<>'pendiente_facturar' or coalesce(w.warranty,false) or not coalesce(w.billable,true)))) then raise exception 'factura: existe un parte asociado no valido'; end if;
  v_base:='FAC-'||to_char(current_date,'YYYY')||'-'; perform pg_advisory_xact_lock(hashtextextended(v_invoice.company_id::text||':invoice:'||v_base,0));
  select coalesce(max(substring(code from length(v_base)+1)::integer),0)+1 into v_next from public.invoices where company_id=v_invoice.company_id and code like v_base||'%' and substring(code from length(v_base)+1)~'^[0-9]+$';
  v_id:=v_invoice.id;
  update public.invoices set code=v_base||lpad(v_next::text,6,'0'),status='emitida',issue_date=current_date,subtotal=v_subtotal,tax_amount=v_tax,total_amount=v_total,updated_by=v_actor.id,updated_at=now() where id=v_id;
  update public.work_orders w set invoiced_amount=l.subtotal,paid_amount=0,economic_status='facturado',updated_by=v_actor.id,updated_at=now() from public.invoice_work_orders l where l.invoice_id=v_id and l.work_order_id=w.id and l.deleted_at is null;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_invoice.company_id,'invoices',v_id,'INVOICE_ISSUE',v_actor.id,to_jsonb(v_invoice),jsonb_build_object('code',v_base||lpad(v_next::text,6,'0'),'subtotal',v_subtotal,'tax_amount',v_tax,'total_amount',v_total));
  return v_id;
end $$;

create or replace function public.dmp_record_invoice_payment(p_invoice_id uuid,p_amount numeric,p_paid_at date,p_method text,p_reference text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_invoice public.invoices; v_id uuid; v_current numeric;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para registrar cobros'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null or v_invoice.status in('borrador','cancelada') then raise exception 'factura: factura no valida para cobro'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if coalesce(p_amount,0)<=0 then raise exception 'cobro: el importe debe ser mayor que cero'; end if;
  if p_method not in('transferencia','tarjeta','efectivo','domiciliacion','otro') then raise exception 'cobro: metodo no valido'; end if;
  select coalesce(sum(amount),0) into v_current from public.invoice_payments where invoice_id=v_invoice.id and reversed_at is null;
  if round(v_current+p_amount,2)>v_invoice.total_amount then raise exception 'cobro: el importe supera el saldo pendiente'; end if;
  insert into public.invoice_payments(company_id,invoice_id,amount,paid_at,method,reference,notes,created_by) values(v_invoice.company_id,v_invoice.id,p_amount,coalesce(p_paid_at,current_date),p_method,nullif(trim(p_reference),''),nullif(trim(p_notes),''),v_actor.id) returning id into v_id;
  perform public.dmp_refresh_invoice_collection(v_invoice.id);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_invoice.company_id,'invoice_payments',v_id,'PAYMENT_RECORD',v_actor.id,null,jsonb_build_object('invoice_id',v_invoice.id,'amount',p_amount,'method',p_method));
  return v_id;
end $$;

revoke all on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) from public,anon;
grant execute on function public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric) to authenticated;
revoke all on function public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric) from public,anon;
grant execute on function public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric) to authenticated;
revoke all on function public.dmp_issue_invoice(uuid) from public,anon;
grant execute on function public.dmp_issue_invoice(uuid) to authenticated;
revoke all on function public.dmp_create_invoice_from_work_order(uuid,numeric,date,text) from public,anon,authenticated;
revoke all on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.dmp_record_invoice_payment(uuid,numeric,date,text,text,text) to authenticated;

commit;
