-- DoorManager Pro - finalize quoted work orders without writing historical quotes.
begin;

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid,p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); w public.work_orders; old jsonb; econ jsonb; v_warranty boolean; v_billable boolean; pending integer:=0; pending_checks integer:=0;
begin
  select * into w from public.work_orders where id=p_work_order_id and deleted_at is null for update; if w.id is null then raise exception 'parte: parte no encontrado o archivado'; end if; perform public.assert_member_of_current_company(w.company_id);
  if w.status in ('Finalizado tecnicamente','Enviado','Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico',w.status; end if;
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or (public.has_any_role(array['Tecnico']) and exists(select 1 from public.work_order_assignments x where x.work_order_id=w.id and x.technician_id=a.id and x.deleted_at is null and x.status not in ('Finalizado','Cancelado')))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;
  if w.quote_id is not null then
    select count(*) into pending from public.quote_lines ql where ql.quote_id=w.quote_id and ql.deleted_at is null and ql.line_type not in ('fee','discount','labor') and (((ql.line_type='material' or ql.material_id is not null) and not exists(select 1 from public.work_order_planned_material_decisions d where d.work_order_id=w.id and d.quote_line_id=ql.id and d.deleted_at is null)) or (ql.line_type<>'material' and ql.material_id is null and not exists(select 1 from public.work_order_quote_line_decisions d where d.work_order_id=w.id and d.quote_line_id=ql.id and d.deleted_at is null)));
    if pending>0 then raise exception 'cierre incompleto: quedan % concepto(s) previstos sin confirmar o marcar como no realizados',pending; end if;
  end if;
  select count(*) into pending_checks from public.checks where work_order_id=w.id and deleted_at is null and status<>'Realizado'; if pending_checks>0 then raise exception 'cierre incompleto: quedan % check(s) sin finalizar',pending_checks; end if;
  old:=to_jsonb(w); v_warranty:=case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean,false) else coalesce(w.warranty,false) or w.type='Garantia' end; v_billable:=case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean,true) else coalesce(w.billable,true) end;
  update public.work_orders set status='Finalizado tecnicamente',warranty=v_warranty,billable=v_billable,economic_review_status='pending',economic_reviewed_at=null,economic_reviewed_by=null,economic_review_reason=null,office_validation_status='pending',office_validation_reason=null,office_validated_at=null,office_validated_by=null,economic_status='pendiente_validacion',finished_at=coalesce(finished_at,now()),sent_at=null,updated_by=a.id,updated_at=now() where id=w.id returning * into w;
  econ:=public.dmp_calculate_work_order_economics(w.id);
  update public.work_orders set quoted_sale_amount=(econ->>'quoted_sale_amount')::numeric,additional_sale_amount=(econ->>'additional_sale_amount')::numeric,sale_amount=(econ->>'sale_amount')::numeric,real_cost_amount=(econ->>'real_cost_amount')::numeric,margin_amount=(econ->>'margin_amount')::numeric,estimated_sale_amount=(econ->>'sale_amount')::numeric,estimated_margin_amount=(econ->>'margin_amount')::numeric where id=w.id returning * into w;
  update public.work_order_assignments set status='Finalizado',updated_at=now() where work_order_id=w.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  if w.quote_id is not null and exists(select 1 from public.quotes where id=w.quote_id and deleted_at is null and status='Aceptado') then perform public.dmp_quote_transition_apply(w.quote_id,'Ejecutado en cliente',coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico del parte'),null,a.id); end if;
  insert into public.work_order_status_history(company_id,work_order_id,previous_status,new_status,changed_by,reason,manual_correction) values(w.company_id,w.id,old->>'status',w.status,a.id,coalesce(nullif(trim(p_payload->>'reason'),''),'Cierre tecnico pendiente de revision economica'),false);
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(w.company_id,'work_orders',w.id,'TECHNICAL_FINALIZE_PENDING_OFFICE',a.id,old,jsonb_build_object('work_order_id',w.id,'economics',econ));
  return w;
end $$;

revoke all on function public.dmp_finalize_work_order_technical(uuid,jsonb) from public,anon;
grant execute on function public.dmp_finalize_work_order_technical(uuid,jsonb) to authenticated;

commit;
