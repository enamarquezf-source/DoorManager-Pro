-- DoorManager Pro - qualify economic review aliases to avoid PL/pgSQL ambiguity.
begin;

create or replace function public.dmp_review_work_order_economic(p_work_order_id uuid,p_decisions jsonb,p_reason text,p_zero_sale_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; d jsonb; v_kind text; v_entry_id uuid; v_sell boolean; v_price numeric; v_source text; econ jsonb; old jsonb; old_lines jsonb; new_lines jsonb; v_expected integer; v_actual integer; v_reason text:=trim(coalesce(p_reason,''));
begin
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then raise exception 'permiso: no tienes permiso para revisar economia del parte'; end if;
  if jsonb_typeof(p_decisions)<>'array' or v_reason='' then raise exception 'validacion del formulario: decisiones y motivo son obligatorios'; end if;
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if w.id is null then raise exception 'parte: parte no encontrado'; end if; perform public.assert_member_of_current_company(w.company_id);
  if w.economic_review_status='approved' then raise exception 'economia: la revision ya esta aprobada'; end if;
  if exists(select 1 from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id where l.work_order_id=w.id and l.deleted_at is null and i.status<>'cancelada') then raise exception 'economia: no se puede modificar un parte asociado a un borrador o factura'; end if;
  select count(*) into v_expected from (select id from public.work_order_time_entries where company_id=w.company_id and work_order_id=w.id union all select id from public.work_order_materials where company_id=w.company_id and work_order_id=w.id and deleted_at is null union all select id from public.work_order_cost_entries where company_id=w.company_id and work_order_id=w.id and deleted_at is null) x;
  v_actual:=jsonb_array_length(p_decisions); if v_expected<>v_actual then raise exception 'validacion del formulario: la revision debe cubrir todos los conceptos economicos'; end if;
  if exists(select 1 from jsonb_to_recordset(p_decisions) decision_rows(kind text,entry_id uuid) group by decision_rows.kind,decision_rows.entry_id having count(*)>1) then raise exception 'validacion del formulario: no se puede repetir un concepto economico'; end if;
  if exists(select 1 from jsonb_array_elements(p_decisions) d where not (d ? 'contributes_to_sale') or jsonb_typeof(d->'contributes_to_sale')<>'boolean') then raise exception 'validacion del formulario: facturabilidad explicita requerida para cada concepto'; end if;
  old:=to_jsonb(w);
  select coalesce(jsonb_agg(entries.row_data order by entries.entry_kind,entries.entry_id),'[]'::jsonb) into old_lines from (
    select 'time' entry_kind,e.id entry_id,jsonb_build_object('kind','time','entry_id',e.id,'unit_price',e.hourly_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) row_data from public.work_order_time_entries e where e.company_id=w.company_id and e.work_order_id=w.id
    union all select 'material',m.id,jsonb_build_object('kind','material','entry_id',m.id,'unit_price',m.unit_price,'total_price',m.total_price,'contributes_to_sale',m.contributes_to_sale,'source',m.source) from public.work_order_materials m where m.company_id=w.company_id and m.work_order_id=w.id and m.deleted_at is null
    union all select 'cost',c.id,jsonb_build_object('kind','cost','entry_id',c.id,'unit_price',c.unit_price,'total_price',c.total_price,'contributes_to_sale',c.contributes_to_sale,'source',c.source) from public.work_order_cost_entries c where c.company_id=w.company_id and c.work_order_id=w.id and c.deleted_at is null
  ) entries;
  for d in select value from jsonb_array_elements(p_decisions) loop
    v_kind:=lower(trim(d->>'kind')); v_entry_id:=nullif(d->>'entry_id','')::uuid; v_sell:=coalesce((d->>'contributes_to_sale')::boolean,false); v_price:=coalesce(nullif(d->>'unit_price','')::numeric,0);
    if v_kind not in ('time','material','cost') or v_entry_id is null then raise exception 'validacion del formulario: concepto economico no valido'; end if;
    if v_sell and v_price<=0 then raise exception 'economia: un concepto vendible necesita precio snapshot positivo'; end if;
    if v_kind='time' then select e.source into v_source from public.work_order_time_entries e where e.id=v_entry_id and e.company_id=w.company_id and e.work_order_id=w.id; update public.work_order_time_entries set hourly_price=case when (d ? 'unit_price') then v_price else hourly_price end,total_price=round(duration_minutes::numeric/60*case when (d ? 'unit_price') then v_price else hourly_price end,2),contributes_to_sale=v_sell,updated_at=now(),updated_by=a.id where id=v_entry_id and company_id=w.company_id and work_order_id=w.id;
    elsif v_kind='material' then select m.source into v_source from public.work_order_materials m where m.id=v_entry_id and m.company_id=w.company_id and m.work_order_id=w.id and m.deleted_at is null; update public.work_order_materials set unit_price=case when (d ? 'unit_price') then v_price else unit_price end,total_price=round(used_quantity*case when (d ? 'unit_price') then v_price else unit_price end,2),contributes_to_sale=v_sell,updated_at=now() where id=v_entry_id and company_id=w.company_id and work_order_id=w.id and deleted_at is null;
    else select c.source into v_source from public.work_order_cost_entries c where c.id=v_entry_id and c.company_id=w.company_id and c.work_order_id=w.id and c.deleted_at is null; update public.work_order_cost_entries set unit_price=case when (d ? 'unit_price') then v_price else unit_price end,total_price=round(quantity*case when (d ? 'unit_price') then v_price else unit_price end,2),contributes_to_sale=v_sell,updated_at=now(),updated_by=a.id where id=v_entry_id and company_id=w.company_id and deleted_at is null; end if;
    if not found then raise exception 'validacion del formulario: existe un concepto ajeno al parte'; end if;
    if (d ? 'source') and (d->>'source') is distinct from v_source then raise exception 'economia: source pertenece al snapshot historico y no puede cambiarse desde esta revision'; end if;
  end loop;
  select coalesce(jsonb_agg(entries.row_data order by entries.entry_kind,entries.entry_id),'[]'::jsonb) into new_lines from (
    select 'time' entry_kind,e.id entry_id,jsonb_build_object('kind','time','entry_id',e.id,'unit_price',e.hourly_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) row_data from public.work_order_time_entries e where e.company_id=w.company_id and e.work_order_id=w.id
    union all select 'material',m.id,jsonb_build_object('kind','material','entry_id',m.id,'unit_price',m.unit_price,'total_price',m.total_price,'contributes_to_sale',m.contributes_to_sale,'source',m.source) from public.work_order_materials m where m.company_id=w.company_id and m.work_order_id=w.id and m.deleted_at is null
    union all select 'cost',c.id,jsonb_build_object('kind','cost','entry_id',c.id,'unit_price',c.unit_price,'total_price',c.total_price,'contributes_to_sale',c.contributes_to_sale,'source',c.source) from public.work_order_cost_entries c where c.company_id=w.company_id and c.work_order_id=w.id and c.deleted_at is null
  ) entries;
  econ:=public.dmp_calculate_work_order_economics(w.id); if coalesce(w.billable,true) and not coalesce(w.warranty,false) and (econ->>'sale_amount')::numeric=0 and not p_zero_sale_confirmed then raise exception 'economia: confirma expresamente una venta cero'; end if;
  update public.work_orders set economic_review_status='approved',economic_reviewed_at=now(),economic_reviewed_by=a.id,economic_review_reason=v_reason,quoted_sale_amount=(econ->>'quoted_sale_amount')::numeric,additional_sale_amount=(econ->>'additional_sale_amount')::numeric,sale_amount=(econ->>'sale_amount')::numeric,real_cost_amount=(econ->>'real_cost_amount')::numeric,margin_amount=(econ->>'margin_amount')::numeric,estimated_sale_amount=(econ->>'sale_amount')::numeric,estimated_margin_amount=(econ->>'margin_amount')::numeric,updated_by=a.id,updated_at=now() where id=w.id;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(w.company_id,'work_orders',w.id,'ECONOMIC_REVIEW_APPROVE',a.id,old,jsonb_build_object('reason',v_reason,'decisions',p_decisions,'zero_sale_confirmed',p_zero_sale_confirmed,'economics',econ,'line_before',old_lines,'line_after',new_lines));
  return jsonb_build_object('work_order_id',w.id,'economics',econ,'status','approved');
end $$;

grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text) to authenticated;
grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) to authenticated;

commit;
