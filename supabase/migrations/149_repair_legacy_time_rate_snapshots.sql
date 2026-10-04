-- Explicit recovery of legacy zero-valued hours. Installing this migration
-- never changes existing entries. Preview first; apply only the same proposal.
begin;

create or replace function public.dmp_repair_legacy_time_rates(
  p_work_order_id uuid, p_apply boolean default false, p_expected_lines jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.profiles := public.dmp024_active_profile();
  w public.work_orders;
  e public.work_order_time_entries;
  r record;
  catalog_id uuid;
  lines jsonb := '[]'::jsonb;
  old_lines jsonb := '[]'::jsonb;
  line jsonb;
  problem text;
  blocked boolean := false;
  econ jsonb;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia']) then
    raise exception 'permiso: solo SAT o un supervisor puede recuperar tarifas historicas';
  end if;
  select * into w from public.work_orders
  where id = p_work_order_id and deleted_at is null for update;
  if w.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(w.company_id);
  if w.economic_review_status = 'approved'
     or w.status not in ('Finalizado tecnicamente','Enviado','Devuelto por SAT') then
    raise exception 'economia: solo se pueden recuperar tarifas en un parte pendiente de revision';
  end if;
  if exists(select 1 from public.invoice_work_orders l join public.invoices i on i.id = l.invoice_id
    where l.work_order_id = w.id and l.deleted_at is null and i.status <> 'cancelada') then
    raise exception 'economia: el parte ya esta asociado a un borrador o factura';
  end if;
  select id into catalog_id from public.rate_catalog
  where company_id = w.company_id and code = 'tecnico' and classification = 'labor'
    and active and deleted_at is null;

  for e in select * from public.work_order_time_entries
    where company_id = w.company_id and work_order_id = w.id
      and duration_minutes > 0 and rate_version_id is null
      and coalesce(source,'manual') = 'manual'
      and coalesce(hourly_cost,0) = 0 and coalesce(hourly_price,0) = 0
      and coalesce(total_cost,0) = 0 and coalesce(total_price,0) = 0
    order by id for update
  loop
    problem := null;
    line := jsonb_build_object('entry_id',e.id,'profile_id',e.profile_id,
      'work_date',e.work_date,'quantity',e.duration_minutes::numeric/60,
      'before',to_jsonb(e));
    begin
      if catalog_id is null then raise exception 'No existe tarifa laboral canonica'; end if;
      if e.profile_id is null or e.work_date is null then
        raise exception 'Falta el tecnico o la fecha de trabajo';
      end if;
      -- Lock applicable versions before resolving to keep the proposed prices
      -- stable during this operation. Use the entry date, never current_date.
      perform 1 from public.rate_versions v
      where v.company_id = w.company_id and v.rate_id = catalog_id
        and v.active and v.deleted_at is null
        and v.valid_from <= e.work_date and (v.valid_to is null or v.valid_to >= e.work_date)
        and (v.technician_profile_id = e.profile_id or v.technician_profile_id is null)
      for share;
      select * into r from public.dmp_resolve_rate(catalog_id,e.profile_id,e.work_date);
      if r.rate_version_id is null then raise exception 'No hay tarifa vigente para esta fecha y tecnico'; end if;
      if r.cost_amount is null or r.sale_amount is null then raise exception 'La tarifa tiene importes incompletos'; end if;
      if r.cost_amount = 0 and r.sale_amount = 0 then raise exception 'La tarifa encontrada tambien tiene ambos importes a cero'; end if;
      if r.billing_mode <> 'hour' or r.unit <> 'h' then raise exception 'La tarifa encontrada no es horaria'; end if;
      line := line || jsonb_build_object('rate_id',r.rate_id,'rate_version_id',r.rate_version_id,
        'cost_amount',r.cost_amount,'sale_amount',r.sale_amount);
    exception when others then
      get stacked diagnostics problem = message_text;
      blocked := true;
      line := line || jsonb_build_object('error',problem);
    end;
    lines := lines || jsonb_build_array(line);
    old_lines := old_lines || jsonb_build_array(to_jsonb(e));
  end loop;

  if p_apply then
    if blocked or jsonb_array_length(lines) = 0 then
      raise exception 'tarifa: no hay una propuesta completa de tarifas historicas aplicable';
    end if;
    if p_expected_lines is null or lines is distinct from p_expected_lines then
      raise exception 'tarifa: los datos o tarifas han cambiado; vuelve a comprobarlos';
    end if;
    for line in select value from jsonb_array_elements(lines) loop
      update public.work_order_time_entries
      set hourly_cost = (line->>'cost_amount')::numeric,
          hourly_price = (line->>'sale_amount')::numeric,
          total_cost = round(duration_minutes::numeric/60*(line->>'cost_amount')::numeric,2),
          total_price = round(duration_minutes::numeric/60*(line->>'sale_amount')::numeric,2),
          rate_id = (line->>'rate_id')::uuid,
          rate_version_id = (line->>'rate_version_id')::uuid,
          billing_mode = 'hour', period_days = null,
          updated_by = a.id, updated_at = now()
      where id = (line->>'entry_id')::uuid and company_id = w.company_id and work_order_id = w.id;
    end loop;
    econ := public.dmp_calculate_work_order_economics(w.id);
    update public.work_orders set real_cost_amount = (econ->>'real_cost_amount')::numeric,
      updated_by = a.id, updated_at = now() where id = w.id;
    insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
    values(w.company_id,'work_orders',w.id,'UPDATE',a.id,
      jsonb_build_object('time_entries',old_lines),jsonb_build_object('action','LEGACY_TIME_RATE_RECOVERY','proposal',lines,'economics',econ));
  end if;
  return jsonb_build_object('lines',lines,'can_apply',not blocked and jsonb_array_length(lines)>0,'applied',p_apply);
end;
$$;
revoke all on function public.dmp_repair_legacy_time_rates(uuid,boolean,jsonb) from public,anon;
grant execute on function public.dmp_repair_legacy_time_rates(uuid,boolean,jsonb) to authenticated;
commit;
