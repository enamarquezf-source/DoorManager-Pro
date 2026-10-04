-- Allow Office economic validation with the same scoped, audited guards.
-- Expose economic failures to SAT and keep approved nonbillable work out of billing.
begin;

create or replace function public.dmp_review_work_order_economic(p_work_order_id uuid,p_decisions jsonb,p_reason text,p_zero_sale_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_decision jsonb; v_kind text; v_entry_id uuid; v_sell boolean; v_price numeric; v_source text; v_economics jsonb; v_old_work jsonb; v_old_lines jsonb; v_new_lines jsonb; v_expected_count integer; v_actual_count integer; v_reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para revisar economia del parte'; end if;
  if jsonb_typeof(p_decisions)<>'array' or v_reason='' then raise exception 'validacion del formulario: decisiones y motivo son obligatorios'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if; perform public.assert_member_of_current_company(v_work.company_id);
  if public.has_any_role(array['Comercial'])
     and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
     and v_work.sat_review_destination is distinct from 'comercial' then
    raise exception 'economia: el parte no esta asignado al comercial actual';
  end if;
  if public.has_any_role(array['Comercial'])
     and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
     and v_work.current_responsible_id is distinct from v_actor.id then
    raise exception 'economia: el parte no esta asignado al comercial actual';
  end if;
  if public.has_any_role(array['Comercial'])
     and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
     and v_work.commercial_review_status is distinct from 'pending' then
    raise exception 'revision Comercial: el parte no esta pendiente de aprobacion';
  end if;
  if v_work.economic_review_status='approved' then raise exception 'economia: la revision ya esta aprobada'; end if;
  if exists(select 1 from public.invoice_work_orders invoice_line join public.invoices invoice_record on invoice_record.id=invoice_line.invoice_id where invoice_line.work_order_id=v_work.id and invoice_line.deleted_at is null and invoice_record.status<>'cancelada') then raise exception 'economia: no se puede modificar un parte asociado a un borrador o factura'; end if;
  select count(*) into v_expected_count from (select time_entry.id from public.work_order_time_entries time_entry where time_entry.company_id=v_work.company_id and time_entry.work_order_id=v_work.id union all select material_entry.id from public.work_order_materials material_entry where material_entry.company_id=v_work.company_id and material_entry.work_order_id=v_work.id and material_entry.deleted_at is null union all select cost_entry.id from public.work_order_cost_entries cost_entry where cost_entry.company_id=v_work.company_id and cost_entry.work_order_id=v_work.id and cost_entry.deleted_at is null) as economic_entries;
  v_actual_count:=jsonb_array_length(p_decisions); if v_expected_count<>v_actual_count then raise exception 'validacion del formulario: la revision debe cubrir todos los conceptos economicos'; end if;
  if exists(select 1 from jsonb_to_recordset(p_decisions) as decision_rows(kind text,entry_id uuid) group by decision_rows.kind,decision_rows.entry_id having count(*)>1) then raise exception 'validacion del formulario: no se puede repetir un concepto economico'; end if;
  if exists(select 1 from jsonb_array_elements(p_decisions) as decision_element(value) where not (decision_element.value ? 'contributes_to_sale') or jsonb_typeof(decision_element.value->'contributes_to_sale')<>'boolean') then raise exception 'validacion del formulario: facturabilidad explicita requerida para cada concepto'; end if;
  v_old_work:=to_jsonb(v_work);
  select coalesce(jsonb_agg(economic_entries.row_data order by economic_entries.entry_kind,economic_entries.entry_id),'[]'::jsonb) into v_old_lines from (
    select 'time' entry_kind,time_entry.id entry_id,jsonb_build_object('kind','time','entry_id',time_entry.id,'unit_price',time_entry.hourly_price,'total_price',time_entry.total_price,'contributes_to_sale',time_entry.contributes_to_sale,'source',time_entry.source) row_data from public.work_order_time_entries time_entry where time_entry.company_id=v_work.company_id and time_entry.work_order_id=v_work.id
    union all select 'material',material_entry.id,jsonb_build_object('kind','material','entry_id',material_entry.id,'unit_price',material_entry.unit_price,'total_price',material_entry.total_price,'contributes_to_sale',material_entry.contributes_to_sale,'source',material_entry.source) from public.work_order_materials material_entry where material_entry.company_id=v_work.company_id and material_entry.work_order_id=v_work.id and material_entry.deleted_at is null
    union all select 'cost',cost_entry.id,jsonb_build_object('kind','cost','entry_id',cost_entry.id,'unit_price',cost_entry.unit_price,'total_price',cost_entry.total_price,'contributes_to_sale',cost_entry.contributes_to_sale,'source',cost_entry.source) from public.work_order_cost_entries cost_entry where cost_entry.company_id=v_work.company_id and cost_entry.work_order_id=v_work.id and cost_entry.deleted_at is null
  ) as economic_entries;
  for v_decision in select decision_element.value from jsonb_array_elements(p_decisions) as decision_element(value) loop
    v_kind:=lower(trim(v_decision->>'kind')); v_entry_id:=nullif(v_decision->>'entry_id','')::uuid; v_sell:=coalesce((v_decision->>'contributes_to_sale')::boolean,false); v_price:=coalesce(nullif(v_decision->>'unit_price','')::numeric,0);
    if v_kind not in ('time','material','cost') or v_entry_id is null then raise exception 'validacion del formulario: concepto economico no valido'; end if;
    if v_sell and v_price<=0 then raise exception 'economia: un concepto vendible necesita precio snapshot positivo'; end if;
    if v_kind='time' then select time_entry.source into v_source from public.work_order_time_entries time_entry where time_entry.id=v_entry_id and time_entry.company_id=v_work.company_id and time_entry.work_order_id=v_work.id; update public.work_order_time_entries set hourly_price=case when (v_decision ? 'unit_price') then v_price else hourly_price end,total_price=round(duration_minutes::numeric/60*case when (v_decision ? 'unit_price') then v_price else hourly_price end,2),contributes_to_sale=v_sell,updated_at=now(),updated_by=v_actor.id where id=v_entry_id and company_id=v_work.company_id and work_order_id=v_work.id;
    elsif v_kind='material' then select material_entry.source into v_source from public.work_order_materials material_entry where material_entry.id=v_entry_id and material_entry.company_id=v_work.company_id and material_entry.work_order_id=v_work.id and material_entry.deleted_at is null; update public.work_order_materials set unit_price=case when (v_decision ? 'unit_price') then v_price else unit_price end,total_price=round(used_quantity*case when (v_decision ? 'unit_price') then v_price else unit_price end,2),contributes_to_sale=v_sell,updated_at=now() where id=v_entry_id and company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null;
    else select cost_entry.source into v_source from public.work_order_cost_entries cost_entry where cost_entry.id=v_entry_id and cost_entry.company_id=v_work.company_id and cost_entry.work_order_id=v_work.id and cost_entry.deleted_at is null; update public.work_order_cost_entries set unit_price=case when (v_decision ? 'unit_price') then v_price else unit_price end,total_price=round(quantity*case when (v_decision ? 'unit_price') then v_price else unit_price end,2),contributes_to_sale=v_sell,updated_at=now(),updated_by=v_actor.id where id=v_entry_id and company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null; end if;
    if not found then raise exception 'validacion del formulario: existe un concepto ajeno al parte'; end if;
    if (v_decision ? 'source') and (v_decision->>'source') is distinct from v_source then raise exception 'economia: source pertenece al snapshot historico y no puede cambiarse desde esta revision'; end if;
  end loop;
  select coalesce(jsonb_agg(economic_entries.row_data order by economic_entries.entry_kind,economic_entries.entry_id),'[]'::jsonb) into v_new_lines from (
    select 'time' entry_kind,time_entry.id entry_id,jsonb_build_object('kind','time','entry_id',time_entry.id,'unit_price',time_entry.hourly_price,'total_price',time_entry.total_price,'contributes_to_sale',time_entry.contributes_to_sale,'source',time_entry.source) row_data from public.work_order_time_entries time_entry where time_entry.company_id=v_work.company_id and time_entry.work_order_id=v_work.id
    union all select 'material',material_entry.id,jsonb_build_object('kind','material','entry_id',material_entry.id,'unit_price',material_entry.unit_price,'total_price',material_entry.total_price,'contributes_to_sale',material_entry.contributes_to_sale,'source',material_entry.source) from public.work_order_materials material_entry where material_entry.company_id=v_work.company_id and material_entry.work_order_id=v_work.id and material_entry.deleted_at is null
    union all select 'cost',cost_entry.id,jsonb_build_object('kind','cost','entry_id',cost_entry.id,'unit_price',cost_entry.unit_price,'total_price',cost_entry.total_price,'contributes_to_sale',cost_entry.contributes_to_sale,'source',cost_entry.source) from public.work_order_cost_entries cost_entry where cost_entry.company_id=v_work.company_id and cost_entry.work_order_id=v_work.id and cost_entry.deleted_at is null
  ) as economic_entries;
  v_economics:=public.dmp_calculate_work_order_economics(v_work.id); if coalesce(v_work.billable,true) and not coalesce(v_work.warranty,false) and (v_economics->>'sale_amount')::numeric=0 and not p_zero_sale_confirmed then raise exception 'economia: confirma expresamente una venta cero'; end if;
  update public.work_orders set economic_review_status='approved',economic_reviewed_at=now(),economic_reviewed_by=v_actor.id,economic_review_reason=v_reason,quoted_sale_amount=(v_economics->>'quoted_sale_amount')::numeric,additional_sale_amount=(v_economics->>'additional_sale_amount')::numeric,sale_amount=(v_economics->>'sale_amount')::numeric,real_cost_amount=(v_economics->>'real_cost_amount')::numeric,margin_amount=(v_economics->>'margin_amount')::numeric,estimated_sale_amount=(v_economics->>'sale_amount')::numeric,estimated_margin_amount=(v_economics->>'margin_amount')::numeric,updated_by=v_actor.id,updated_at=now() where id=v_work.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'ECONOMIC_REVIEW_APPROVE',v_actor.id,v_old_work,jsonb_build_object('reason',v_reason,'decisions',p_decisions,'zero_sale_confirmed',p_zero_sale_confirmed,'economics',v_economics,'line_before',v_old_lines,'line_after',v_new_lines));
  return jsonb_build_object('work_order_id',v_work.id,'economics',v_economics,'status','approved');
end $$;

revoke all on function public.dmp_review_work_order_economic(uuid,jsonb,text) from public,anon;
revoke all on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) from public,anon;
grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text) to authenticated;
grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) to authenticated;


create or replace function public.dmp_reopen_work_order_economic(p_work_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; old jsonb; n integer;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']) then raise exception 'permiso: no tienes permiso para reabrir la revision economica'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null for update; if w.id is null then raise exception 'parte: parte no encontrado'; end if; perform public.assert_member_of_current_company(w.company_id);
  if public.has_any_role(array['Comercial']) and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) and (w.sat_review_destination <> 'comercial' or w.current_responsible_id <> a.id) then raise exception 'permiso: el parte no esta asignado al comercial actual'; end if;
  if w.economic_review_status<>'approved' then raise exception 'economia: solo se puede reabrir una revision aprobada'; end if;
  select count(*) into n from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=w.id and l.deleted_at is null and i.status in ('borrador','emitida','parcialmente_cobrada','cobrada');
  if n>0 then raise exception 'economia: existe un borrador o factura emitida/cobrada y la revision permanece congelada'; end if;
  old:=to_jsonb(w); update public.work_orders set economic_review_status='returned',economic_reviewed_at=null,economic_reviewed_by=null,economic_review_reason=trim(p_reason),updated_by=a.id,updated_at=now() where id=w.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(w.company_id,'work_orders',w.id,'ECONOMIC_REVIEW_REOPEN',a.id,old,jsonb_build_object('reason',trim(p_reason),'status','returned'));
  return jsonb_build_object('work_order_id',w.id,'status','returned');
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
    case when p_queue='sat' and wo.sat_review_status='approved' then 'Corrección económica' when wo.sat_review_destination='comercial' then 'Desde Comercial' else 'Desde SAT' end,
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
    and ((p_queue='sat' and wo.status in ('Finalizado tecnicamente','Devuelto por SAT') and (wo.sat_review_status in ('pending','returned') or (wo.sat_review_status='approved' and wo.sat_review_destination='facturacion' and (wo.economic_review_status is distinct from 'approved' or (coalesce(wo.billable,true) and not coalesce(wo.warranty,false) and coalesce(wo.sale_amount,0)<=0)))))
      or (p_queue='commercial' and wo.sat_review_destination='comercial' and wo.commercial_review_status='pending' and (v_supervisor or wo.current_responsible_id=public.current_profile_id()))
      or (p_queue='billing' and wo.sat_review_status='approved' and (wo.economic_review_status is distinct from 'approved' or (coalesce(wo.billable,true) and coalesce(wo.sale_amount,0)>0)) and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved'))))
  group by wo.id,c.legal_name,s.name,q.code,sp.first_name,sp.last_name;
end $$;


create or replace function public.dmp_update_work_order_billing_flags(p_work_order_id uuid,p_billable boolean,p_warranty boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_work public.work_orders; v_reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para corregir facturabilidad'; end if;
  if v_reason='' or p_billable is null or p_warranty is null then raise exception 'economia: facturabilidad, garantia y motivo son obligatorios'; end if;
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status not in ('Finalizado tecnicamente','Devuelto por SAT','Enviado') then raise exception 'economia: solo se puede corregir un parte terminado pendiente de facturar'; end if;
  if exists(select 1 from public.invoice_work_orders billing_line join public.invoices invoice_record on invoice_record.id=billing_line.invoice_id where billing_line.work_order_id=v_work.id and billing_line.deleted_at is null and invoice_record.status<>'cancelada') then raise exception 'economia: existe un borrador o factura y la revision permanece congelada'; end if;
  update public.work_orders set billable=p_billable,warranty=p_warranty,economic_review_status='pending',economic_reviewed_at=null,economic_reviewed_by=null,economic_review_reason=v_reason,updated_by=v_actor.id,updated_at=now() where id=v_work.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_work.company_id,'work_orders',v_work.id,'ECONOMIC_REVIEW_REOPEN',v_actor.id,to_jsonb(v_work),jsonb_build_object('reason',v_reason,'billable',p_billable,'warranty',p_warranty,'economic_review_status','pending'));
  return jsonb_build_object('work_order_id',v_work.id,'status','pending');
end $$;
revoke all on function public.dmp_update_work_order_billing_flags(uuid,boolean,boolean,text) from public,anon;
grant execute on function public.dmp_update_work_order_billing_flags(uuid,boolean,boolean,text) to authenticated;
commit;
