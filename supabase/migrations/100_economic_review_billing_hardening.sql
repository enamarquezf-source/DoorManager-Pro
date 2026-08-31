-- DoorManager Pro - economic review and billing hardening.
-- This migration is local-only and deliberately creates no tables.
begin;

alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log add constraint audit_log_operation_check check (operation in (
  'INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE',
  'TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_DRAFT_CREATE',
  'INVOICE_DRAFT_UPDATE','INVOICE_ISSUE','INVOICE_ISSUE_OVERRIDE','PAYMENT_RECORD',
  'MATERIAL_CREATE','WAREHOUSE_STOCK_RECONCILE','ECONOMIC_REVIEW_APPROVE','ECONOMIC_REVIEW_REOPEN'
));

drop index if exists public.invoice_work_orders_active_work_unique;
create index if not exists invoice_work_orders_active_work_lookup on public.invoice_work_orders(company_id, work_order_id) where deleted_at is null and work_order_id is not null;

create or replace function public.dmp_guided_billing_eligible(p_work_order_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare w public.work_orders;
begin
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null;
  return w.id is not null and w.company_id=public.current_company_id()
    and coalesce(w.billable,true) and coalesce(w.sale_amount,0)>0
    and (
      (w.economic_review_status='approved' and w.economic_status in ('pendiente_facturar','pendiente_validacion')
        and w.sat_review_status='approved'
        and (w.sat_review_destination='facturacion' or (w.sat_review_destination='comercial' and w.commercial_review_status='approved')))
      or (w.economic_review_status='not_started' and w.economic_status='pendiente_facturar' and w.office_validation_status='validated')
    );
end $$;

create or replace function public.dmp_calculate_work_order_economics(p_work_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; cost numeric:=0; quoted numeric:=0; additional numeric:=0; operational numeric:=0; warranty_sale numeric:=0; sale numeric:=0; has_quote boolean:=false;
begin
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null;
  if w.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(w.company_id);
  select round(coalesce(sum(total_cost),0),2) into cost from (
    select total_cost from public.work_order_materials where company_id=w.company_id and work_order_id=w.id and deleted_at is null
    union all select total_cost from public.work_order_time_entries where company_id=w.company_id and work_order_id=w.id
    union all select total_cost from public.work_order_cost_entries where company_id=w.company_id and work_order_id=w.id and deleted_at is null) x;
  select round(coalesce(nullif(q.taxable_base,0),nullif(q.subtotal_sale,0),nullif(q.subtotal,0),0),2),true into quoted,has_quote from public.quotes q where q.company_id=w.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente') and (q.id=w.quote_id or q.work_order_id=w.id) order by (q.id=w.quote_id) desc,q.updated_at desc nulls last limit 1;
  if not found then quoted:=0; has_quote:=false; end if;
  select round(coalesce(sum(total_price),0),2) into additional from (
    select total_price from public.work_order_materials where company_id=w.company_id and work_order_id=w.id and deleted_at is null and source='additional' and contributes_to_sale
    union all select total_price from public.work_order_time_entries where company_id=w.company_id and work_order_id=w.id and source='additional' and contributes_to_sale
    union all select total_price from public.work_order_cost_entries where company_id=w.company_id and work_order_id=w.id and deleted_at is null and source='additional' and contributes_to_sale) x;
  select round(coalesce(sum(total_price),0),2) into operational from (
    select total_price from public.work_order_materials where company_id=w.company_id and work_order_id=w.id and deleted_at is null and coalesce(source,'manual')<>'quote' and contributes_to_sale
    union all select total_price from public.work_order_time_entries where company_id=w.company_id and work_order_id=w.id and coalesce(source,'manual')<>'quote' and contributes_to_sale
    union all select total_price from public.work_order_cost_entries where company_id=w.company_id and work_order_id=w.id and deleted_at is null and coalesce(source,'manual')<>'quote' and contributes_to_sale) x;
  select round(coalesce(sum(total_price),0),2) into warranty_sale from (
    select total_price from public.work_order_materials where company_id=w.company_id and work_order_id=w.id and deleted_at is null and contributes_to_sale
    union all select total_price from public.work_order_time_entries where company_id=w.company_id and work_order_id=w.id and contributes_to_sale
    union all select total_price from public.work_order_cost_entries where company_id=w.company_id and work_order_id=w.id and deleted_at is null and contributes_to_sale
  ) x;
  if not coalesce(w.billable,true) then sale:=0; elsif coalesce(w.warranty,false) then sale:=warranty_sale; elsif has_quote then sale:=round(quoted+additional,2); else sale:=operational; end if;
  return jsonb_build_object('real_cost_amount',cost,'quoted_sale_amount',case when has_quote and coalesce(w.billable,true) and not coalesce(w.warranty,false) then quoted else 0 end,'additional_sale_amount',case when coalesce(w.billable,true) and not coalesce(w.warranty,false) then additional else 0 end,'operational_sale_amount',case when coalesce(w.billable,true) and (not has_quote or coalesce(w.warranty,false)) then case when w.warranty then warranty_sale else operational end else 0 end,'sale_amount',sale,'margin_amount',round(sale-cost,2),'has_accepted_quote',has_quote);
end $$;

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid,p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; old jsonb; econ jsonb; v_warranty boolean; v_billable boolean; pending integer:=0; pending_checks integer:=0;
begin
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if w.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(w.company_id);
  if w.status in ('Finalizado tecnicamente','Enviado','Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico',w.status; end if;
  -- RB-009: technical finalization belongs to field roles and SAT/management, not Office.
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or (public.has_any_role(array['Tecnico']) and exists(select 1 from public.work_order_assignments x where x.work_order_id=w.id and x.technician_id=a.id and x.deleted_at is null and x.status not in ('Finalizado','Cancelado')))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;
  if w.quote_id is not null then
    select count(*) into pending from public.quote_lines ql where ql.quote_id=w.quote_id and ql.deleted_at is null and ql.line_type not in ('fee','discount','labor') and (((ql.line_type='material' or ql.material_id is not null) and not exists(select 1 from public.work_order_planned_material_decisions d where d.work_order_id=w.id and d.quote_line_id=ql.id and d.deleted_at is null)) or (ql.line_type<>'material' and ql.material_id is null and not exists(select 1 from public.work_order_quote_line_decisions d where d.work_order_id=w.id and d.quote_line_id=ql.id and d.deleted_at is null)));
    if pending>0 then raise exception 'cierre incompleto: quedan % concepto(s) previstos sin confirmar o marcar como no realizados',pending; end if;
  end if;
  select count(*) into pending_checks from public.checks where work_order_id=w.id and deleted_at is null and status<>'Realizado';
  if pending_checks>0 then raise exception 'cierre incompleto: quedan % check(s) sin finalizar',pending_checks; end if;
  old:=to_jsonb(w); v_warranty:=case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean,false) else coalesce(w.warranty,false) or w.type='Garantia' end; v_billable:=case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean,true) else coalesce(w.billable,true) end;
  update public.work_orders set status='Finalizado tecnicamente',warranty=v_warranty,billable=v_billable,economic_review_status='pending',economic_reviewed_at=null,economic_reviewed_by=null,economic_review_reason=null,office_validation_status='pending',office_validation_reason=null,office_validated_at=null,office_validated_by=null,economic_status='pendiente_validacion',finished_at=coalesce(finished_at,now()),sent_at=null,updated_by=a.id,updated_at=now() where id=w.id returning * into w;
  econ:=public.dmp_calculate_work_order_economics(w.id);
  update public.work_orders set quoted_sale_amount=(econ->>'quoted_sale_amount')::numeric,additional_sale_amount=(econ->>'additional_sale_amount')::numeric,sale_amount=(econ->>'sale_amount')::numeric,real_cost_amount=(econ->>'real_cost_amount')::numeric,margin_amount=(econ->>'margin_amount')::numeric,estimated_sale_amount=(econ->>'sale_amount')::numeric,estimated_margin_amount=(econ->>'margin_amount')::numeric where id=w.id returning * into w;
  update public.work_order_assignments set status='Finalizado',updated_at=now() where work_order_id=w.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  if w.quote_id is not null and exists(select 1 from public.quotes where id=w.quote_id and deleted_at is null and status='Aceptado') then perform public.dmp_quote_transition_apply(w.quote_id,'Ejecutado en cliente',coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico del parte'),null,a.id); update public.quotes set work_order_id=coalesce(work_order_id,w.id) where id=w.quote_id; end if;
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(w.company_id,w.id,old->>'status',w.status,a.id,coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico pendiente de revision economica'),false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(w.company_id,'work_orders',w.id,'TECHNICAL_FINALIZE_PENDING_OFFICE',a.id,old,jsonb_build_object('work_order_id',w.id,'economics',econ));
  return w;
end $$;

create or replace function public.dmp_review_work_order_economic(p_work_order_id uuid,p_decisions jsonb,p_reason text,p_zero_sale_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; d jsonb; kind text; eid uuid; sell boolean; price numeric; source text; econ jsonb; old jsonb; old_lines jsonb; new_lines jsonb; expected integer; actual integer; reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then raise exception 'permiso: no tienes permiso para revisar economia del parte'; end if;
  if jsonb_typeof(p_decisions)<>'array' or reason='' then raise exception 'validacion del formulario: decisiones y motivo son obligatorios'; end if;
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if w.id is null then raise exception 'parte: parte no encontrado'; end if; perform public.assert_member_of_current_company(w.company_id);
  if w.economic_review_status='approved' then raise exception 'economia: la revision ya esta aprobada'; end if;
  if exists(select 1 from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=w.id and l.deleted_at is null and i.status<>'cancelada') then raise exception 'economia: no se puede modificar un parte asociado a un borrador o factura'; end if;
  select count(*) into expected from (select id from public.work_order_time_entries where company_id=w.company_id and work_order_id=w.id union all select id from public.work_order_materials where company_id=w.company_id and work_order_id=w.id and deleted_at is null union all select id from public.work_order_cost_entries where company_id=w.company_id and work_order_id=w.id and deleted_at is null) x;
  actual:=jsonb_array_length(p_decisions); if expected<>actual then raise exception 'validacion del formulario: la revision debe cubrir todos los conceptos economicos'; end if;
  if exists(select 1 from jsonb_to_recordset(p_decisions) d(kind text,entry_id uuid) group by kind,entry_id having count(*)>1) then raise exception 'validacion del formulario: no se puede repetir un concepto economico'; end if;
  if exists(select 1 from jsonb_array_elements(p_decisions) d where not (d ? 'contributes_to_sale') or jsonb_typeof(d->'contributes_to_sale')<>'boolean') then raise exception 'validacion del formulario: facturabilidad explicita requerida para cada concepto'; end if;
  old:=to_jsonb(w);
  select coalesce(jsonb_agg(row_data order by kind,entry_id),'[]'::jsonb) into old_lines from (
    select 'time' kind,e.id entry_id,jsonb_build_object('kind','time','entry_id',e.id,'unit_price',e.hourly_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) row_data from public.work_order_time_entries e where e.company_id=w.company_id and e.work_order_id=w.id
    union all select 'material',m.id,jsonb_build_object('kind','material','entry_id',m.id,'unit_price',m.unit_price,'total_price',m.total_price,'contributes_to_sale',m.contributes_to_sale,'source',m.source) from public.work_order_materials m where m.company_id=w.company_id and m.work_order_id=w.id and m.deleted_at is null
    union all select 'cost',c.id,jsonb_build_object('kind','cost','entry_id',c.id,'unit_price',c.unit_price,'total_price',c.total_price,'contributes_to_sale',c.contributes_to_sale,'source',c.source) from public.work_order_cost_entries c where c.company_id=w.company_id and c.work_order_id=w.id and c.deleted_at is null
  ) entries;
  for d in select value from jsonb_array_elements(p_decisions) loop
    kind:=lower(trim(d->>'kind')); eid:=nullif(d->>'entry_id','')::uuid; sell:=coalesce((d->>'contributes_to_sale')::boolean,false); price:=coalesce(nullif(d->>'unit_price','')::numeric,0);
    if kind not in ('time','material','cost') or eid is null then raise exception 'validacion del formulario: concepto economico no valido'; end if;
    if sell and price<=0 then raise exception 'economia: un concepto vendible necesita precio snapshot positivo'; end if;
     if kind='time' then select e.source into source from public.work_order_time_entries e where e.id=eid and e.company_id=w.company_id and e.work_order_id=w.id; update public.work_order_time_entries set hourly_price=case when (d ? 'unit_price') then price else hourly_price end,total_price=round(duration_minutes::numeric/60*case when (d ? 'unit_price') then price else hourly_price end,2),contributes_to_sale=sell,updated_at=now(),updated_by=a.id where id=eid and company_id=w.company_id and work_order_id=w.id;
     elsif kind='material' then select m.source into source from public.work_order_materials m where m.id=eid and m.company_id=w.company_id and m.work_order_id=w.id and m.deleted_at is null; update public.work_order_materials set unit_price=case when (d ? 'unit_price') then price else unit_price end,total_price=round(used_quantity*case when (d ? 'unit_price') then price else unit_price end,2),contributes_to_sale=sell,updated_at=now() where id=eid and company_id=w.company_id and work_order_id=w.id and deleted_at is null;
     else select c.source into source from public.work_order_cost_entries c where c.id=eid and c.company_id=w.company_id and c.work_order_id=w.id and c.deleted_at is null; update public.work_order_cost_entries set unit_price=case when (d ? 'unit_price') then price else unit_price end,total_price=round(quantity*case when (d ? 'unit_price') then price else unit_price end,2),contributes_to_sale=sell,updated_at=now(),updated_by=a.id where id=eid and company_id=w.company_id and work_order_id=w.id and deleted_at is null; end if;
     if not found then raise exception 'validacion del formulario: existe un concepto ajeno al parte'; end if;
     if (d ? 'source') and (d->>'source') is distinct from source then raise exception 'economia: source pertenece al snapshot historico y no puede cambiarse desde esta revision'; end if;
   end loop;
  select coalesce(jsonb_agg(row_data order by kind,entry_id),'[]'::jsonb) into new_lines from (
    select 'time' kind,e.id entry_id,jsonb_build_object('kind','time','entry_id',e.id,'unit_price',e.hourly_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) row_data from public.work_order_time_entries e where e.company_id=w.company_id and e.work_order_id=w.id
    union all select 'material',m.id,jsonb_build_object('kind','material','entry_id',m.id,'unit_price',m.unit_price,'total_price',m.total_price,'contributes_to_sale',m.contributes_to_sale,'source',m.source) from public.work_order_materials m where m.company_id=w.company_id and m.work_order_id=w.id and m.deleted_at is null
    union all select 'cost',c.id,jsonb_build_object('kind','cost','entry_id',c.id,'unit_price',c.unit_price,'total_price',c.total_price,'contributes_to_sale',c.contributes_to_sale,'source',c.source) from public.work_order_cost_entries c where c.company_id=w.company_id and c.work_order_id=w.id and c.deleted_at is null
  ) entries;
  econ:=public.dmp_calculate_work_order_economics(w.id); if coalesce(w.billable,true) and not coalesce(w.warranty,false) and (econ->>'sale_amount')::numeric=0 and not p_zero_sale_confirmed then raise exception 'economia: confirma expresamente una venta cero'; end if;
  update public.work_orders set economic_review_status='approved',economic_reviewed_at=now(),economic_reviewed_by=a.id,economic_review_reason=reason,quoted_sale_amount=(econ->>'quoted_sale_amount')::numeric,additional_sale_amount=(econ->>'additional_sale_amount')::numeric,sale_amount=(econ->>'sale_amount')::numeric,real_cost_amount=(econ->>'real_cost_amount')::numeric,margin_amount=(econ->>'margin_amount')::numeric,estimated_sale_amount=(econ->>'sale_amount')::numeric,estimated_margin_amount=(econ->>'margin_amount')::numeric,updated_by=a.id,updated_at=now() where id=w.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(w.company_id,'work_orders',w.id,'ECONOMIC_REVIEW_APPROVE',a.id,old,jsonb_build_object('reason',reason,'decisions',p_decisions,'zero_sale_confirmed',p_zero_sale_confirmed,'economics',econ,'line_before',old_lines,'line_after',new_lines));
  return jsonb_build_object('work_order_id',w.id,'economics',econ,'status','approved');
end $$;

create or replace function public.dmp_review_work_order_economic(p_work_order_id uuid,p_decisions jsonb,p_reason text) returns jsonb language sql security definer set search_path=public as $$ select public.dmp_review_work_order_economic($1,$2,$3,false) $$;

create or replace function public.dmp_update_invoice_draft(p_invoice_id uuid,p_lines jsonb,p_due_date date default null,p_notes text default null,p_tax_rate numeric default null)
returns void language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); i public.invoices; l jsonb; q numeric; price numeric; disc numeric; tax numeric; sub numeric; ta numeric; total numeric; wid uuid; actual numeric; expected numeric; status text:='complete'; v_work_count integer; v_manual_line_count integer; v_strict_single boolean;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para editar borradores'; end if;
  if jsonb_typeof(p_lines)<>'array' then raise exception 'factura: las lineas deben ser un array'; end if;
  select * into i from public.invoices where id=p_invoice_id for update; if i.id is null then raise exception 'factura: factura no encontrada'; end if; perform public.assert_member_of_current_company(i.company_id);
  if i.status<>'borrador' then raise exception 'factura: solo se pueden editar borradores'; end if;
  tax:=coalesce(p_tax_rate,i.tax_rate); if tax<0 then raise exception 'factura: IVA no valido'; end if;
  delete from public.invoice_work_orders where invoice_id=i.id and deleted_at is null;
  for l in select value from jsonb_array_elements(p_lines) loop
    if trim(coalesce(l->>'description',''))='' then raise exception 'factura: cada linea necesita descripcion'; end if;
    q:=coalesce(nullif(l->>'quantity','')::numeric,1); price:=coalesce(nullif(l->>'unit_price','')::numeric,0); disc:=coalesce(nullif(l->>'discount','')::numeric,0); wid:=nullif(l->>'work_order_id','')::uuid;
     if q<0 or price<0 or disc<0 or disc>100 or coalesce(nullif(l->>'tax_rate','')::numeric,tax)<0 then raise exception 'factura: importe, cantidad, descuento o IVA no valido'; end if;
    if wid is not null and not public.dmp_guided_billing_eligible(wid) then raise exception 'factura: parte asociado no valido para este borrador'; end if;
    if wid is not null and not exists(select 1 from public.work_orders w where w.id=wid and w.company_id=i.company_id and w.deleted_at is null) then raise exception 'factura: parte asociado no pertenece a la empresa'; end if;
    sub:=round(q*price*(1-disc/100),2); ta:=round(sub*coalesce(nullif(l->>'tax_rate','')::numeric,tax)/100,2); total:=round(sub+ta,2);
    insert into public.invoice_work_orders(company_id,invoice_id,work_order_id,description,quantity,unit_price,discount,subtotal,tax_rate,tax_amount,total_amount) values(i.company_id,i.id,wid,trim(l->>'description'),q,price,disc,sub,coalesce(nullif(l->>'tax_rate','')::numeric,tax),ta,total);
  end loop;
  select round(coalesce(sum(subtotal),0),2) into actual from public.invoice_work_orders where invoice_id=i.id and deleted_at is null;
  select count(distinct work_order_id) into v_work_count from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is not null;
  select count(*) into v_manual_line_count from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is null;
  v_strict_single:=v_work_count=1 and v_manual_line_count=0;
  expected:=null;
  if v_strict_single then
    select round(coalesce(sum(w.sale_amount),0),2) into expected from public.work_orders w join (select distinct work_order_id from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is not null) x on x.work_order_id=w.id;
    if round(actual,2)<>round(expected,2) then status:='inconsistent'; end if;
  end if;
  -- Non-strict invoices are compatible by composition, not against a synthetic work-order total.
  update public.invoices set due_date=p_due_date,notes=nullif(trim(p_notes),''),tax_rate=tax,subtotal=actual,tax_amount=round(actual*tax/100,2),total_amount=round(actual*(1+tax/100),2),economic_expected_amount=expected,economic_actual_amount=actual,economic_detail_status=status,economic_override_reason=null,economic_override_by=null,economic_override_at=null,updated_by=a.id,updated_at=now() where id=i.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(i.company_id,'invoices',i.id,'INVOICE_DRAFT_UPDATE',a.id,to_jsonb(i),jsonb_build_object('actual_amount',actual,'economic_detail_status',status));
end $$;

create or replace function public.dmp_issue_invoice(p_invoice_id uuid,p_override boolean default false,p_override_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); i public.invoices; w public.work_orders; c public.companies; cl public.clients; s public.sites; q public.quotes; l record; base text; next_no integer; sub numeric; tax numeric; total numeric; invalid integer; wid uuid; sale numeric; stale boolean:=false; reason text:=trim(coalesce(p_override_reason,'')); snapshot jsonb; work_count integer; manual_line_count integer; strict_single boolean;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para emitir facturas'; end if;
  select * into i from public.invoices where id=p_invoice_id for update; if i.id is null then raise exception 'factura: factura no encontrada'; end if; perform public.assert_member_of_current_company(i.company_id);
  if i.status<>'borrador' then raise exception 'factura: solo se pueden emitir borradores'; end if;
  select count(*) filter(where total_amount<=0 or subtotal<0 or tax_amount<0),round(coalesce(sum(subtotal),0),2),round(coalesce(sum(tax_amount),0),2),round(coalesce(sum(total_amount),0),2) into invalid,sub,tax,total from public.invoice_work_orders where invoice_id=i.id and deleted_at is null;
  if not exists(select 1 from public.invoice_work_orders where invoice_id=i.id and deleted_at is null) or invalid>0 or total<=0 then raise exception 'factura: el borrador necesita al menos una linea valida y un total mayor que cero'; end if;
  select count(distinct work_order_id) into work_count from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is not null;
  select count(*) into manual_line_count from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is null;
  strict_single:=work_count=1 and manual_line_count=0;
  for l in select work_order_id,round(sum(subtotal),2) subtotal from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is not null group by work_order_id loop
    if not public.dmp_guided_billing_eligible(l.work_order_id) then raise exception 'factura: existe un parte asociado no valido'; end if;
    select round(coalesce(w.sale_amount,0),2) into sale from public.work_orders w where w.id=l.work_order_id;
     if strict_single and round(l.subtotal,2)<>sale then stale:=true; end if;
  end loop;
  if strict_single and (i.economic_expected_amount is null or round(i.economic_expected_amount,2)<>sub) then stale:=true; end if;
  if stale and not p_override then raise exception 'factura: el borrador esta obsoleto respecto a la economia aprobada; requiere excepcion autorizada'; end if;
  if p_override and reason='' then raise exception 'factura: el motivo de excepcion es obligatorio'; end if;
  if p_override and not stale then raise exception 'factura: la excepcion solo aplica a una inconsistencia economica real'; end if;
  base:='FAC-'||to_char(current_date,'YYYY-'); perform pg_advisory_xact_lock(hashtextextended(i.company_id::text||':invoice:'||base,0));
  select coalesce(max(substring(code from length(base)+1)::integer),0)+1 into next_no from public.invoices where company_id=i.company_id and code like base||'%' and substring(code from length(base)+1)~'^[0-9]+$';
  select wo.* into w from public.invoice_work_orders x join public.work_orders wo on wo.id=x.work_order_id where x.invoice_id=i.id and x.deleted_at is null and x.work_order_id is not null order by x.id limit 1;
  select * into c from public.companies where id=i.company_id; select * into cl from public.clients where id=i.client_id; select * into s from public.sites where id=w.site_id; select * into q from public.quotes where id=w.quote_id;
  snapshot:=jsonb_build_object('emitter',jsonb_build_object('name',c.name,'trade_name',c.trade_name,'tax_id',c.tax_id,'address',c.address,'postal_code',c.postal_code,'city',c.city,'province',c.province,'country',c.country,'phone',c.phone,'email',c.email,'website',c.website),'client',jsonb_build_object('legal_name',cl.legal_name,'trade_name',cl.trade_name,'tax_id',cl.tax_id,'address',cl.address,'postal_code',cl.postal_code,'city',cl.city,'province',cl.province,'country',cl.country,'phone',cl.phone,'email',cl.email),'work',case when w.id is null then '{}'::jsonb else jsonb_build_object('code',w.code,'title',w.title,'site_name',s.name,'site_code',s.code,'quote_code',q.code) end,'works',coalesce((select jsonb_agg(jsonb_build_object('work_order_id',x.work_order_id,'code',wo.code,'title',wo.title) order by x.work_order_id) from (select distinct work_order_id from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is not null) x join public.work_orders wo on wo.id=x.work_order_id),'[]'::jsonb),'lines',coalesce((select jsonb_agg(jsonb_build_object('work_order_id',x.work_order_id,'description',x.description,'quantity',x.quantity,'unit_price',x.unit_price,'discount',x.discount,'subtotal',x.subtotal,'tax_rate',x.tax_rate,'tax_amount',x.tax_amount,'total_amount',x.total_amount) order by x.id) from public.invoice_work_orders x where x.invoice_id=i.id and x.deleted_at is null),'[]'::jsonb),'totals',jsonb_build_object('subtotal',sub,'tax_amount',tax,'total_amount',total,'issue_date',current_date));
  update public.invoices set code=base||lpad(next_no::text,6,'0'),status='emitida',issue_date=current_date,subtotal=sub,tax_amount=tax,total_amount=total,fiscal_snapshot=snapshot,economic_expected_amount=case when strict_single then sale else null end,economic_detail_status=case when p_override then 'overridden' else 'complete' end,economic_override_reason=case when p_override then reason end,economic_override_by=case when p_override then a.id end,economic_override_at=case when p_override then now() end,updated_by=a.id,updated_at=now() where id=i.id;
  update public.work_orders w set invoiced_amount=totals.subtotal,paid_amount=0,economic_status='facturado',updated_by=a.id,updated_at=now() from (select work_order_id,round(sum(subtotal),2) subtotal from public.invoice_work_orders where invoice_id=i.id and deleted_at is null and work_order_id is not null group by work_order_id) totals where totals.work_order_id=w.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(i.company_id,'invoices',i.id,case when p_override then 'INVOICE_ISSUE_OVERRIDE' else 'INVOICE_ISSUE' end,a.id,to_jsonb(i),jsonb_build_object('subtotal',sub,'tax_amount',tax,'total_amount',total,'fiscal_snapshot',true,'invoice_mode',case when strict_single then 'strict_single' when work_count=0 then 'manual' when manual_line_count>0 then 'hybrid' else 'multi' end,'expected_amount',case when strict_single then sale else null end,'actual_amount',sub));
  return i.id;
end $$;

create or replace function public.dmp_reopen_work_order_economic(p_work_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; old jsonb; n integer;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Comercial']) then raise exception 'permiso: no tienes permiso para reabrir la revision economica'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null for update; if w.id is null then raise exception 'parte: parte no encontrado'; end if; perform public.assert_member_of_current_company(w.company_id);
  if public.has_any_role(array['Comercial']) and not public.has_any_role(array['superadmin','SAT','Gerencia']) and (w.sat_review_destination <> 'comercial' or w.current_responsible_id <> a.id) then raise exception 'permiso: el parte no esta asignado al comercial actual'; end if;
  if w.economic_review_status<>'approved' then raise exception 'economia: solo se puede reabrir una revision aprobada'; end if;
  select count(*) into n from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=w.id and l.deleted_at is null and i.status in ('borrador','emitida','parcialmente_cobrada','cobrada');
  if n>0 then raise exception 'economia: existe un borrador o factura emitida/cobrada y la revision permanece congelada'; end if;
  old:=to_jsonb(w); update public.work_orders set economic_review_status='returned',economic_reviewed_at=null,economic_reviewed_by=null,economic_review_reason=trim(p_reason),updated_by=a.id,updated_at=now() where id=w.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(w.company_id,'work_orders',w.id,'ECONOMIC_REVIEW_REOPEN',a.id,old,jsonb_build_object('reason',trim(p_reason),'status','returned'));
  return jsonb_build_object('work_order_id',w.id,'status','returned');
end $$;

revoke all on function public.dmp_calculate_work_order_economics(uuid) from public,anon,authenticated;
revoke all on function public.dmp_review_work_order_economic(uuid,jsonb,text) from public,anon;
revoke all on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) from public,anon;
revoke all on function public.dmp_reopen_work_order_economic(uuid,text) from public,anon;
revoke all on function public.dmp_finalize_work_order_technical(uuid,jsonb) from public,anon;
-- No direct client consumer exists; billing RPCs call this helper internally.
revoke all on function public.dmp_guided_billing_eligible(uuid) from public,anon,authenticated;
grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text) to authenticated;
grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) to authenticated;
grant execute on function public.dmp_reopen_work_order_economic(uuid,text) to authenticated;
grant execute on function public.dmp_update_invoice_draft(uuid,jsonb,date,text,numeric) to authenticated;
grant execute on function public.dmp_issue_invoice(uuid,boolean,text) to authenticated;

commit;
