-- DoorManager Pro - technical close must preserve zero quote snapshots.
-- A SELECT INTO with no rows assigns NULL to its target variables in PL/pgSQL.
-- Work-order economic snapshot columns are NOT NULL and zero is valid here.
begin;

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile(); v_work public.work_orders; v_old jsonb;
  v_real_cost numeric := 0; v_quote numeric := 0; v_additional numeric := 0; v_operational_sale numeric := 0; v_sale numeric := 0; v_margin numeric := 0;
  v_billable boolean; v_warranty boolean; v_economic_status text; v_has_quote boolean := false;
begin
  select * into v_work from public.work_orders where id=p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico', v_work.status; end if;
  if not (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or (public.has_any_role(array['Tecnico']) and exists (select 1 from public.work_order_assignments a where a.work_order_id=v_work.id and a.technician_id=v_actor.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado'))) or (public.has_any_role(array['Comercial']) and public.dmp024_can_commercial_operate(v_work,v_actor))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;
  v_old := to_jsonb(v_work);
  select round(coalesce(sum(total_cost),0),2) into v_real_cost from (
    select total_cost from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
    union all select total_cost from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
    union all select total_cost from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
  ) x;
  select round(coalesce(taxable_base,subtotal_sale,subtotal,0),2), true into v_quote, v_has_quote
    from public.quotes
    where company_id=v_work.company_id and deleted_at is null and status in ('Aceptado','Ejecutado en cliente')
      and (id=v_work.quote_id or work_order_id=v_work.id)
    order by case when id=v_work.quote_id then 0 else 1 end, issue_date desc nulls last, created_at desc nulls last, id desc limit 1;
  if not found then
    v_quote := 0;
    v_has_quote := false;
  end if;
  select round(coalesce(sum(total_price) filter (where source='additional' and contributes_to_sale),0),2) into v_additional
    from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null;
  select round(coalesce(sum(total_price),0),2) into v_operational_sale from (
    select total_price from public.work_order_materials where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null
    union all select total_price from public.work_order_time_entries where company_id=v_work.company_id and work_order_id=v_work.id
    union all select total_price from public.work_order_cost_entries where company_id=v_work.company_id and work_order_id=v_work.id and deleted_at is null and source <> 'quote' and contributes_to_sale
  ) x;
  v_warranty := case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean,false) else coalesce(v_work.warranty,false) or v_work.type='Garantia' end;
  v_billable := case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean,true) else coalesce(v_work.billable,true) end;
  if v_warranty then v_billable := false; end if;
  v_economic_status := case when v_warranty then 'garantia' when not v_billable then 'no_facturable' else 'pendiente_facturar' end;
  if v_economic_status in ('garantia','no_facturable') then v_quote := 0; v_additional := 0; v_operational_sale := 0; end if;
  v_sale := case when v_has_quote then round(v_quote + v_additional,2) else v_operational_sale end;
  v_margin := round(v_sale-v_real_cost,2);
  update public.work_orders set status='Finalizado tecnicamente', economic_status=v_economic_status, billable=v_billable, warranty=v_warranty,
    quoted_sale_amount=coalesce(v_quote,0), additional_sale_amount=coalesce(v_additional,0), sale_amount=coalesce(v_sale,0), real_cost_amount=coalesce(v_real_cost,0),
    margin_amount=coalesce(v_margin,0), estimated_sale_amount=coalesce(v_sale,0), estimated_margin_amount=coalesce(v_margin,0), finished_at=coalesce(finished_at,now()),
    sent_at=null, updated_by=v_actor.id, updated_at=now() where id=v_work.id returning * into v_work;
  update public.work_order_assignments set status='Finalizado', updated_at=now() where work_order_id=v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  if v_old->>'status' is distinct from v_work.status then insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(v_work.company_id,v_work.id,v_old->>'status',v_work.status,v_actor.id,coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico del parte'),false); end if;
  if v_work.quote_id is not null and exists(select 1 from public.quotes where id=v_work.quote_id and deleted_at is null and status='Aceptado') then
    perform public.dmp_quote_transition_apply(v_work.quote_id,'Ejecutado en cliente',coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico del parte'),null,v_actor.id);
    update public.quotes set work_order_id=coalesce(work_order_id,v_work.id) where id=v_work.quote_id;
  end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
    values(v_work.company_id,'work_orders',v_work.id,'TECHNICAL_FINALIZE',v_actor.id,v_old,jsonb_build_object('status',v_work.status,'quoted_sale_amount',v_work.quoted_sale_amount,'additional_sale_amount',v_work.additional_sale_amount,'sale_amount',v_work.sale_amount,'real_cost_amount',v_work.real_cost_amount,'margin_amount',v_work.margin_amount));
  return v_work;
end $$;

commit;
