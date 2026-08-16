-- DoorManager Pro - cierre tecnico y preparacion para facturacion.
-- Idempotente. No consume stock: el consumo real sigue en dmp_upsert_work_order_material.

begin;

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_can_operate boolean := false;
  v_real_cost numeric := 0;
  v_sale_amount numeric := 0;
  v_quote_sale numeric := null;
  v_material_cost numeric := 0;
  v_material_sale numeric := 0;
  v_time_cost numeric := 0;
  v_time_sale numeric := 0;
  v_aux_cost numeric := 0;
  v_aux_sale numeric := 0;
  v_billable boolean;
  v_warranty boolean;
  v_economic_status text;
  v_reason text := coalesce(nullif(trim(p_payload->>'reason'), ''), 'Cierre tecnico del parte');
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico', v_work.status; end if;

  v_can_operate := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
    or (public.has_any_role(array['Tecnico']) and public.dmp024_is_work_order_active_status(v_work.status) and exists (
      select 1 from public.work_order_assignments a
      where a.work_order_id = v_work.id
        and a.technician_id = v_profile.id
        and a.deleted_at is null
        and a.status not in ('Finalizado','Cancelado')
    ))
    or (public.has_any_role(array['Comercial']) and public.dmp024_can_commercial_operate(v_work, v_profile));
  if not v_can_operate then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;

  v_old := to_jsonb(v_work);

  select
    round(coalesce(sum(coalesce(used_quantity, 0) * coalesce(unit_cost, unit_price, 0)), 0), 2),
    round(coalesce(sum(coalesce(used_quantity, 0) * coalesce(unit_price, 0)), 0), 2)
  into v_material_cost, v_material_sale
  from public.work_order_materials
  where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;

  select
    round(coalesce(sum(coalesce(total_cost, duration_minutes::numeric / 60 * coalesce(hourly_cost, 0))), 0), 2),
    round(coalesce(sum(coalesce(total_price, duration_minutes::numeric / 60 * coalesce(hourly_price, 0))), 0), 2)
  into v_time_cost, v_time_sale
  from public.work_order_time_entries
  where company_id = v_work.company_id and work_order_id = v_work.id;

  select
    round(coalesce(sum(coalesce(total_cost, quantity * coalesce(unit_cost, 0))), 0), 2),
    round(coalesce(sum(coalesce(total_price, quantity * coalesce(unit_price, 0))), 0), 2)
  into v_aux_cost, v_aux_sale
  from public.work_order_cost_entries
  where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;

  select round(coalesce(taxable_base, subtotal_sale, subtotal, 0), 2)
  into v_quote_sale
  from public.quotes
  where company_id = v_work.company_id
    and deleted_at is null
    and status in ('Aceptado','Ejecutado en cliente')
    and (id = v_work.quote_id or work_order_id = v_work.id)
  order by case when id = v_work.quote_id then 0 else 1 end, issue_date desc nulls last, created_at desc nulls last, id desc
  limit 1;

  v_real_cost := round(coalesce(v_material_cost, 0) + coalesce(v_time_cost, 0) + coalesce(v_aux_cost, 0), 2);
  v_warranty := case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean, false) else coalesce(v_work.warranty, false) or v_work.type = 'Garantia' end;
  v_billable := case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean, true) else coalesce(v_work.billable, true) end;
  if v_warranty then v_billable := false; end if;
  v_economic_status := case when v_warranty then 'garantia' when not v_billable then 'no_facturable' else 'pendiente_facturar' end;
  v_sale_amount := case
    when v_economic_status in ('garantia','no_facturable') then 0
    else round(coalesce(nullif(p_payload->>'estimated_sale_amount', '')::numeric, nullif(v_work.estimated_sale_amount, 0), v_quote_sale, coalesce(v_material_sale, 0) + coalesce(v_time_sale, 0) + coalesce(v_aux_sale, 0), 0), 2)
  end;

  update public.work_orders
  set status = 'Finalizado tecnicamente',
      economic_status = v_economic_status,
      billable = v_billable,
      warranty = v_warranty,
      real_cost_amount = v_real_cost,
      estimated_sale_amount = v_sale_amount,
      estimated_margin_amount = case when v_economic_status in ('garantia','no_facturable') then 0 else round(v_sale_amount - v_real_cost, 2) end,
      finished_at = coalesce(finished_at, now()),
      sent_at = null,
      updated_by = v_profile.id,
      updated_at = now()
  where id = v_work.id
  returning * into v_work;

  update public.work_order_assignments
  set status = 'Finalizado', updated_at = now()
  where work_order_id = v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');

  if v_old->>'status' is distinct from v_work.status then
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction)
    values (v_work.company_id, v_work.id, v_old->>'status', v_work.status, v_profile.id, v_reason, false);
  end if;

  update public.quotes
  set status = 'Ejecutado en cliente', work_order_id = coalesce(work_order_id, v_work.id), updated_by = v_profile.id, updated_at = now()
  where company_id = v_work.company_id and id = v_work.quote_id and deleted_at is null and status = 'Aceptado';

  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_work.company_id, 'work_orders', v_work.id, 'TECHNICAL_FINALIZE', v_profile.id, v_old, jsonb_build_object('status', v_work.status, 'economic_status', v_work.economic_status, 'real_cost_amount', v_work.real_cost_amount, 'estimated_sale_amount', v_work.estimated_sale_amount, 'estimated_margin_amount', v_work.estimated_margin_amount, 'reason', v_reason));

  return v_work;
end;
$$;

revoke all on function public.dmp_finalize_work_order_technical(uuid, jsonb) from public;
revoke all on function public.dmp_finalize_work_order_technical(uuid, jsonb) from anon;
grant execute on function public.dmp_finalize_work_order_technical(uuid, jsonb) to authenticated;

commit;
