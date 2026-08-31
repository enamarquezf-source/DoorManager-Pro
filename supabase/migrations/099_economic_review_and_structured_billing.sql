-- DoorManager Pro - economic review and structured billing contract.
-- Prepared locally for review. Do not apply without Product Owner approval.
begin;

alter table public.work_orders
  add column if not exists economic_review_status text not null default 'not_started',
  add column if not exists economic_reviewed_at timestamptz,
  add column if not exists economic_reviewed_by uuid references public.profiles(id),
  add column if not exists economic_review_reason text;

alter table public.work_orders drop constraint if exists work_orders_economic_review_status_check;
alter table public.work_orders add constraint work_orders_economic_review_status_check
  check (economic_review_status in ('not_started','pending','approved','returned'));

alter table public.invoices
  add column if not exists economic_detail_status text not null default 'not_required',
  add column if not exists economic_expected_amount numeric(12,2),
  add column if not exists economic_actual_amount numeric(12,2),
  add column if not exists economic_override_reason text,
  add column if not exists economic_override_by uuid references public.profiles(id),
  add column if not exists economic_override_at timestamptz;

alter table public.invoices drop constraint if exists invoices_economic_detail_status_check;
alter table public.invoices add constraint invoices_economic_detail_status_check
  check (economic_detail_status in ('not_required','complete','inconsistent','overridden'));

drop index if exists public.invoice_work_orders_active_work_unique;
create index if not exists invoice_work_orders_active_work_lookup
  on public.invoice_work_orders(company_id, work_order_id)
  where deleted_at is null and work_order_id is not null;

alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log add constraint audit_log_operation_check check (operation in (
  'INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE',
  'TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_DRAFT_CREATE',
  'INVOICE_DRAFT_UPDATE','INVOICE_ISSUE','INVOICE_ISSUE_OVERRIDE','PAYMENT_RECORD',
  'MATERIAL_CREATE','WAREHOUSE_STOCK_RECONCILE','ECONOMIC_REVIEW_APPROVE'
));

create or replace function public.dmp_calculate_work_order_economics(p_work_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_quote numeric := 0;
  v_additional numeric := 0;
  v_operational numeric := 0;
  v_real_cost numeric := 0;
  v_sale numeric := 0;
  v_margin numeric := 0;
  v_has_quote boolean := false;
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);

  select round(coalesce(sum(total_cost), 0), 2) into v_real_cost from (
    select total_cost from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null
    union all select total_cost from public.work_order_time_entries where company_id = v_work.company_id and work_order_id = v_work.id
    union all select total_cost from public.work_order_cost_entries where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null
  ) costs;

   select round(coalesce(nullif(q.taxable_base, 0), nullif(q.subtotal_sale, 0), nullif(q.subtotal, 0), 0), 2), true
    into v_quote, v_has_quote
  from public.quotes q
  where q.company_id = v_work.company_id and q.deleted_at is null
    and q.status in ('Aceptado','Ejecutado en cliente')
    and (q.id = v_work.quote_id or q.work_order_id = v_work.id)
  order by case when q.id = v_work.quote_id then 0 else 1 end, q.updated_at desc nulls last, q.id desc
  limit 1;
  if not found then v_quote := 0; v_has_quote := false; end if;

   select round(coalesce(sum(total_price), 0), 2) into v_additional from (
     select total_price from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null and source = 'additional' and contributes_to_sale
     union all select total_price from public.work_order_time_entries where company_id = v_work.company_id and work_order_id = v_work.id and source = 'additional' and contributes_to_sale
     union all select total_price from public.work_order_cost_entries where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null and source = 'additional' and contributes_to_sale
   ) additional_rows;

   select round(coalesce(sum(total_price), 0), 2) into v_operational from (
     select total_price from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null and coalesce(source, 'manual') <> 'quote' and contributes_to_sale
     union all select total_price from public.work_order_time_entries where company_id = v_work.company_id and work_order_id = v_work.id and coalesce(source, 'manual') <> 'quote' and contributes_to_sale
     union all select total_price from public.work_order_cost_entries where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null and coalesce(source, 'manual') <> 'quote' and contributes_to_sale
   ) operational_rows;

  if coalesce(v_work.warranty, false) or not coalesce(v_work.billable, true) then
    v_sale := 0;
  elsif v_has_quote then
    v_sale := round(v_quote + v_additional, 2);
  else
    v_sale := v_operational;
  end if;
  v_margin := round(v_sale - v_real_cost, 2);
  return jsonb_build_object(
    'real_cost_amount', v_real_cost,
    'quoted_sale_amount', case when v_has_quote and not coalesce(v_work.warranty, false) and coalesce(v_work.billable, true) then v_quote else 0 end,
    'additional_sale_amount', case when not coalesce(v_work.warranty, false) and coalesce(v_work.billable, true) then v_additional else 0 end,
    'operational_sale_amount', case when not v_has_quote and not coalesce(v_work.warranty, false) and coalesce(v_work.billable, true) then v_operational else 0 end,
    'sale_amount', v_sale,
    'margin_amount', v_margin,
    'has_accepted_quote', v_has_quote
  );
end;
$$;

create or replace function public.dmp_review_work_order_economic(
  p_work_order_id uuid,
  p_decisions jsonb,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_old_entries jsonb;
  v_new_entries jsonb;
  v_decision jsonb;
  v_kind text;
  v_entry_id uuid;
  v_sale_price numeric;
  v_contributes boolean;
  v_existing_source text;
  v_expected_entries integer;
  v_decision_entries integer;
  v_economics jsonb;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then
    raise exception 'permiso: no tienes permiso para revisar economia del parte';
  end if;
  if jsonb_typeof(p_decisions) <> 'array' then raise exception 'validacion del formulario: las decisiones deben ser un array'; end if;
  if v_reason = '' then raise exception 'validacion del formulario: el motivo de revision es obligatorio'; end if;
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.economic_review_status = 'approved' then raise exception 'economia: la revision ya esta aprobada'; end if;
  if exists (select 1 from public.invoice_work_orders l join public.invoices i on i.id = l.invoice_id where l.work_order_id = v_work.id and l.deleted_at is null and i.status <> 'cancelada') then
    raise exception 'economia: no se puede modificar un parte asociado a un borrador o factura';
  end if;
  if public.has_any_role(array['Comercial']) and not public.has_any_role(array['superadmin','SAT','Gerencia']) and (v_work.sat_review_destination <> 'comercial' or v_work.current_responsible_id <> v_actor.id) then
    raise exception 'permiso: el parte no esta asignado al comercial actual';
  end if;
  v_old := to_jsonb(v_work);
  select count(*) into v_expected_entries from (
    select id from public.work_order_time_entries where company_id = v_work.company_id and work_order_id = v_work.id
    union all select id from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null
    union all select id from public.work_order_cost_entries where company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null
  ) entries;
  v_decision_entries := jsonb_array_length(p_decisions);
  if v_expected_entries = 0 then raise exception 'validacion del formulario: no existen conceptos economicos que revisar'; end if;
  if v_decision_entries <> v_expected_entries then raise exception 'validacion del formulario: la revision debe cubrir todos los conceptos economicos'; end if;
  if exists (select 1 from jsonb_to_recordset(p_decisions) as d(kind text, entry_id uuid) group by kind, entry_id having count(*) > 1) then raise exception 'validacion del formulario: no se puede repetir un concepto economico'; end if;
  if exists (select 1 from jsonb_to_recordset(p_decisions) as d(kind text, entry_id uuid) where not exists (
    select 1 from public.work_order_time_entries e where d.kind = 'time' and e.id = d.entry_id and e.company_id = v_work.company_id and e.work_order_id = v_work.id
    union all select 1 from public.work_order_materials e where d.kind = 'material' and e.id = d.entry_id and e.company_id = v_work.company_id and e.work_order_id = v_work.id and e.deleted_at is null
    union all select 1 from public.work_order_cost_entries e where d.kind = 'cost' and e.id = d.entry_id and e.company_id = v_work.company_id and e.work_order_id = v_work.id and e.deleted_at is null
  )) then raise exception 'validacion del formulario: existe un concepto ajeno al parte'; end if;
  select coalesce(jsonb_agg(entry order by kind, entry_id), '[]'::jsonb) into v_old_entries from (
    select 'time' kind, e.id entry_id, jsonb_build_object('kind','time','entry_id',e.id,'hourly_price',e.hourly_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) entry from public.work_order_time_entries e where e.company_id = v_work.company_id and e.work_order_id = v_work.id
    union all select 'material', e.id, jsonb_build_object('kind','material','entry_id',e.id,'unit_price',e.unit_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) from public.work_order_materials e where e.company_id = v_work.company_id and e.work_order_id = v_work.id and e.deleted_at is null
    union all select 'cost', e.id, jsonb_build_object('kind','cost','entry_id',e.id,'unit_price',e.unit_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) from public.work_order_cost_entries e where e.company_id = v_work.company_id and e.work_order_id = v_work.id and e.deleted_at is null
  ) entries;

  for v_decision in select value from jsonb_array_elements(p_decisions) loop
    v_kind := lower(trim(coalesce(v_decision->>'kind', '')));
    v_entry_id := nullif(v_decision->>'entry_id', '')::uuid;
    v_contributes := coalesce((v_decision->>'contributes_to_sale')::boolean, false);
    v_sale_price := coalesce(nullif(v_decision->>'unit_price', '')::numeric, null);
    if v_kind not in ('time','material','cost') or v_entry_id is null then raise exception 'validacion del formulario: concepto economico no valido'; end if;
    if v_contributes and (v_sale_price is null or v_sale_price <= 0) then raise exception 'economia: un concepto vendible necesita precio snapshot positivo'; end if;

    if v_kind = 'time' then
      select source into v_existing_source from public.work_order_time_entries where id = v_entry_id and company_id = v_work.company_id and work_order_id = v_work.id;
      update public.work_order_time_entries set hourly_price = coalesce(v_sale_price, hourly_price), total_price = round(duration_minutes::numeric / 60 * coalesce(v_sale_price, hourly_price), 2), contributes_to_sale = v_contributes, updated_at = now(), updated_by = v_actor.id where id = v_entry_id and company_id = v_work.company_id and work_order_id = v_work.id;
    elsif v_kind = 'material' then
      select source into v_existing_source from public.work_order_materials where id = v_entry_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;
      update public.work_order_materials set unit_price = coalesce(v_sale_price, unit_price), total_price = round(used_quantity * coalesce(v_sale_price, unit_price), 2), contributes_to_sale = v_contributes, updated_at = now() where id = v_entry_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;
    else
      select source into v_existing_source from public.work_order_cost_entries where id = v_entry_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;
      update public.work_order_cost_entries set unit_price = coalesce(v_sale_price, unit_price), total_price = round(quantity * coalesce(v_sale_price, unit_price), 2), contributes_to_sale = v_contributes, updated_at = now(), updated_by = v_actor.id where id = v_entry_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;
    end if;
    if not found then raise exception 'economia: el concepto no pertenece al parte o no existe'; end if;
    if (v_decision ? 'source') and (v_decision->>'source') is distinct from v_existing_source then raise exception 'economia: source pertenece al snapshot historico y no puede cambiarse desde esta revision'; end if;
  end loop;

  if exists (select 1 from public.work_order_time_entries where work_order_id = v_work.id and contributes_to_sale and (duration_minutes is null or duration_minutes <= 0 or hourly_price is null or hourly_price <= 0 or total_price is null or total_price <= 0))
     or exists (select 1 from public.work_order_materials where work_order_id = v_work.id and deleted_at is null and contributes_to_sale and (used_quantity is null or used_quantity <= 0 or unit_price is null or unit_price <= 0 or total_price is null or total_price <= 0))
     or exists (select 1 from public.work_order_cost_entries where work_order_id = v_work.id and deleted_at is null and contributes_to_sale and (quantity is null or quantity <= 0 or unit_price is null or unit_price <= 0 or total_price is null or total_price <= 0)) then
    raise exception 'economia: todos los conceptos vendibles necesitan snapshot de venta positivo';
  end if;

  v_economics := public.dmp_calculate_work_order_economics(v_work.id);
  select coalesce(jsonb_agg(entry order by kind, entry_id), '[]'::jsonb) into v_new_entries from (
    select 'time' kind, e.id entry_id, jsonb_build_object('kind','time','entry_id',e.id,'hourly_price',e.hourly_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) entry from public.work_order_time_entries e where e.company_id = v_work.company_id and e.work_order_id = v_work.id
    union all select 'material', e.id, jsonb_build_object('kind','material','entry_id',e.id,'unit_price',e.unit_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) from public.work_order_materials e where e.company_id = v_work.company_id and e.work_order_id = v_work.id and e.deleted_at is null
    union all select 'cost', e.id, jsonb_build_object('kind','cost','entry_id',e.id,'unit_price',e.unit_price,'total_price',e.total_price,'contributes_to_sale',e.contributes_to_sale,'source',e.source) from public.work_order_cost_entries e where e.company_id = v_work.company_id and e.work_order_id = v_work.id and e.deleted_at is null
  ) entries;
  update public.work_orders set economic_review_status = 'approved', economic_reviewed_at = now(), economic_reviewed_by = v_actor.id, economic_review_reason = v_reason,
    quoted_sale_amount = (v_economics->>'quoted_sale_amount')::numeric, additional_sale_amount = (v_economics->>'additional_sale_amount')::numeric,
    sale_amount = (v_economics->>'sale_amount')::numeric, real_cost_amount = (v_economics->>'real_cost_amount')::numeric,
    margin_amount = (v_economics->>'margin_amount')::numeric, estimated_sale_amount = (v_economics->>'sale_amount')::numeric,
    estimated_margin_amount = (v_economics->>'margin_amount')::numeric, updated_by = v_actor.id, updated_at = now()
  where id = v_work.id returning * into v_work;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_work.company_id, 'work_orders', v_work.id, 'ECONOMIC_REVIEW_APPROVE', v_actor.id, v_old,
    jsonb_build_object('reason', v_reason, 'decisions', p_decisions, 'economics', v_economics, 'line_before', v_old_entries, 'line_after', v_new_entries));
  return jsonb_build_object('work_order_id', v_work.id, 'economics', v_economics, 'status', v_work.economic_review_status);
end;
$$;

create or replace function public.dmp_finalize_work_order_technical(p_work_order_id uuid, p_payload jsonb default '{}'::jsonb)
returns public.work_orders language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_old jsonb;
  v_economics jsonb;
  v_warranty boolean;
  v_billable boolean;
  v_pending integer := 0;
  v_pending_checks integer := 0;
begin
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado o archivado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if v_work.status in ('Finalizado tecnicamente','Enviado','Cerrado','Cancelado') then raise exception 'estado editable: el parte esta % y no permite cierre tecnico', v_work.status; end if;
  if not (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or (public.has_any_role(array['Tecnico']) and exists (select 1 from public.work_order_assignments a where a.work_order_id = v_work.id and a.technician_id = v_actor.id and a.deleted_at is null and a.status not in ('Finalizado','Cancelado')))) then raise exception 'permiso: no tienes permiso para finalizar tecnicamente este parte'; end if;
  if v_work.quote_id is not null then
    select count(*) into v_pending from public.quote_lines ql where ql.quote_id = v_work.quote_id and ql.deleted_at is null and ql.line_type not in ('fee','discount','labor') and (((ql.line_type = 'material' or ql.material_id is not null) and not exists (select 1 from public.work_order_planned_material_decisions d where d.work_order_id = v_work.id and d.quote_line_id = ql.id and d.deleted_at is null)) or (ql.line_type <> 'material' and ql.material_id is null and not exists (select 1 from public.work_order_quote_line_decisions d where d.work_order_id = v_work.id and d.quote_line_id = ql.id and d.deleted_at is null)));
    if v_pending > 0 then raise exception 'cierre incompleto: quedan % concepto(s) previstos sin confirmar o marcar como no realizados', v_pending; end if;
  end if;
  select count(*) into v_pending_checks from public.checks where work_order_id = v_work.id and deleted_at is null and status <> 'Realizado';
  if v_pending_checks > 0 then raise exception 'cierre incompleto: quedan % check(s) sin finalizar', v_pending_checks; end if;
  v_old := to_jsonb(v_work);
  v_warranty := case when p_payload ? 'warranty' then coalesce((p_payload->>'warranty')::boolean, false) else coalesce(v_work.warranty, false) or v_work.type = 'Garantia' end;
  v_billable := case when p_payload ? 'billable' then coalesce((p_payload->>'billable')::boolean, true) else coalesce(v_work.billable, true) end;
  if v_warranty then v_billable := false; end if;
  update public.work_orders set status = 'Finalizado tecnicamente', warranty = v_warranty, billable = v_billable, economic_review_status = 'pending', office_validation_status = 'pending', economic_status = 'pendiente_validacion', finished_at = coalesce(finished_at, now()), sent_at = null, updated_by = v_actor.id, updated_at = now()
  where id = v_work.id returning * into v_work;
  v_economics := public.dmp_calculate_work_order_economics(v_work.id);
  update public.work_orders set quoted_sale_amount = (v_economics->>'quoted_sale_amount')::numeric, additional_sale_amount = (v_economics->>'additional_sale_amount')::numeric, sale_amount = (v_economics->>'sale_amount')::numeric, real_cost_amount = (v_economics->>'real_cost_amount')::numeric, margin_amount = (v_economics->>'margin_amount')::numeric, estimated_sale_amount = (v_economics->>'sale_amount')::numeric, estimated_margin_amount = (v_economics->>'margin_amount')::numeric where id = v_work.id returning * into v_work;
  update public.work_order_assignments set status = 'Finalizado', updated_at = now() where work_order_id = v_work.id and deleted_at is null and status not in ('Finalizado','Cancelado');
  if v_work.quote_id is not null and exists (select 1 from public.quotes where id = v_work.quote_id and deleted_at is null and status = 'Aceptado') then
    perform public.dmp_quote_transition_apply(v_work.quote_id, 'Ejecutado en cliente', coalesce(nullif(trim(p_payload->>'reason'), ''), 'Cierre tecnico del parte'), null, v_actor.id);
    update public.quotes set work_order_id = coalesce(work_order_id, v_work.id) where id = v_work.quote_id;
  end if;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_work.company_id, v_work.id, v_old->>'status', v_work.status, v_actor.id, coalesce(nullif(trim(p_payload->>'reason'), ''), 'Cierre tecnico pendiente de revision economica'), false);
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_work.company_id, 'work_orders', v_work.id, 'TECHNICAL_FINALIZE_PENDING_OFFICE', v_actor.id, v_old, jsonb_build_object('work_order_id', v_work.id, 'economics', v_economics));
  return v_work;
end;
$$;

create or replace function public.dmp_prepare_invoice_from_work_order(p_work_order_id uuid, p_due_date date default null, p_notes text default null, p_tax_rate numeric default 21)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile(); v_work public.work_orders; v_existing uuid; v_existing_status text; v_existing_count integer; v_invoice uuid; v_tax numeric := coalesce(p_tax_rate, 0); v_line record; v_attached boolean := false; v_expected numeric; v_actual numeric; v_detail_status text := 'complete'; v_notes text; v_quote_lines_total numeric := 0; v_quote_accum numeric := 0; v_line_subtotal numeric; v_line_discount numeric;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para preparar facturas'; end if;
  select * into v_work from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_work.id is null then raise exception 'parte: parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
   select count(distinct i.id) into v_existing_count from public.invoice_work_orders l join public.invoices i on i.id = l.invoice_id where l.work_order_id = v_work.id and l.deleted_at is null and i.status <> 'cancelada';
   if v_existing_count > 1 then raise exception 'factura: el parte tiene varias facturas activas asociadas'; end if;
   if v_existing_count = 1 then
     select i.id, i.status into v_existing, v_existing_status from public.invoice_work_orders l join public.invoices i on i.id = l.invoice_id where l.work_order_id = v_work.id and l.deleted_at is null and i.status <> 'cancelada' group by i.id, i.status;
     if v_existing_status = 'borrador' then return v_existing; end if;
     raise exception 'factura: el parte ya esta asociado a una factura';
   end if;
   if not public.dmp_guided_billing_eligible(v_work.id) then raise exception 'factura: el parte no esta listo para facturacion'; end if;
   if v_work.economic_review_status <> 'approved' and not (v_work.economic_review_status = 'not_started' and v_work.economic_status = 'pendiente_facturar' and v_work.office_validation_status = 'validated') then raise exception 'factura: la revision economica del parte no esta aprobada'; end if;
  if v_tax < 0 then raise exception 'factura: IVA no valido'; end if;
  v_expected := round(coalesce(v_work.sale_amount, 0), 2);
  insert into public.invoices(company_id, client_id, status, issue_date, due_date, subtotal, tax_rate, tax_amount, total_amount, notes, created_by, updated_by, economic_expected_amount, economic_detail_status)
  values (v_work.company_id, v_work.client_id, 'borrador', current_date, p_due_date, 0, v_tax, 0, 0, nullif(trim(p_notes), ''), v_actor.id, v_actor.id, v_expected, 'complete') returning id into v_invoice;

   if exists (select 1 from public.quotes q where q.id = v_work.quote_id and q.company_id = v_work.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente')) then
     select round(coalesce(sum(subtotal), 0), 2) into v_quote_lines_total from (select greatest(coalesce(nullif(ql.total_price, 0), nullif(ql.total, 0), ql.quantity * ql.unit_price * (1 - ql.discount_percent / 100)), 0) subtotal from public.quote_lines ql where ql.quote_id = v_work.quote_id and ql.company_id = v_work.company_id and ql.deleted_at is null) quote_rows;
      for v_line in select ql.description, ql.quantity, ql.unit_price, ql.discount_percent, greatest(round(coalesce(nullif(ql.total_price, 0), nullif(ql.total, 0), ql.quantity * ql.unit_price * (1 - ql.discount_percent / 100)), 2), 0) subtotal, row_number() over (order by ql.position) line_no, count(*) over () line_count from public.quote_lines ql where ql.quote_id = v_work.quote_id and ql.company_id = v_work.company_id and ql.deleted_at is null and greatest(round(coalesce(nullif(ql.total_price, 0), nullif(ql.total, 0), ql.quantity * ql.unit_price * (1 - ql.discount_percent / 100)), 2), 0) > 0 order by ql.position loop
       if v_line.subtotal > 0 then
         v_line_subtotal := case when v_quote_lines_total > 0 and v_line.line_no = v_line.line_count then greatest(round(v_quote - v_quote_accum, 2), 0) when v_quote_lines_total > 0 then round(v_line.subtotal * v_quote / v_quote_lines_total, 2) else v_line.subtotal end;
         v_line_discount := case when coalesce(v_line.quantity, 0) * coalesce(v_line.unit_price, 0) > 0 then greatest(least(100, round(100 - v_line_subtotal / (v_line.quantity * v_line.unit_price) * 100, 2)), 0) else coalesce(v_line.discount_percent, 0) end;
         insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, trim(v_line.description), coalesce(v_line.quantity, 1), coalesce(v_line.unit_price, 0), v_line_discount, v_line_subtotal, v_tax, round(v_line_subtotal * v_tax / 100, 2), round(v_line_subtotal * (1 + v_tax / 100), 2)); v_quote_accum := v_quote_accum + v_line_subtotal; v_attached := true;
       end if;
    end loop;
    for v_line in select coalesce(nullif(trim(m.description), ''), 'Material adicional') description, m.used_quantity quantity, m.unit_price, m.total_price subtotal from public.work_order_materials m where m.company_id = v_work.company_id and m.work_order_id = v_work.id and m.deleted_at is null and m.source = 'additional' and m.contributes_to_sale loop
       if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, v_line.description, coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
    end loop;
    for v_line in select coalesce(nullif(trim(t.description), ''), 'Mano de obra adicional') description, round(t.duration_minutes::numeric / 60, 3) quantity, t.hourly_price unit_price, t.total_price subtotal from public.work_order_time_entries t where t.company_id = v_work.company_id and t.work_order_id = v_work.id and t.source = 'additional' and t.contributes_to_sale loop
       if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, v_line.description, coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
     end loop;
    for v_line in select coalesce(nullif(trim(c.description), ''), 'Coste adicional') description, c.quantity, c.unit_price, c.total_price subtotal from public.work_order_cost_entries c where c.company_id = v_work.company_id and c.work_order_id = v_work.id and c.deleted_at is null and c.source = 'additional' and c.contributes_to_sale loop
       if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, v_line.description, coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
    end loop;
   else
     for v_line in select coalesce(nullif(trim(m.description), ''), mat.description, 'Material') description, m.used_quantity quantity, m.unit_price, m.total_price subtotal from public.work_order_materials m left join public.materials mat on mat.id = m.material_id and mat.company_id = m.company_id where m.company_id = v_work.company_id and m.work_order_id = v_work.id and m.deleted_at is null and coalesce(m.source, 'manual') <> 'quote' and m.contributes_to_sale loop
       if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, trim(v_line.description), coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
    end loop;
     for v_line in select coalesce(nullif(trim(t.description), ''), 'Mano de obra') description, round(t.duration_minutes::numeric / 60, 3) quantity, t.hourly_price unit_price, t.total_price subtotal from public.work_order_time_entries t where t.company_id = v_work.company_id and t.work_order_id = v_work.id and coalesce(t.source, 'manual') <> 'quote' and t.contributes_to_sale loop
       if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, trim(v_line.description), coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
    end loop;
     for v_line in select coalesce(nullif(trim(c.description), ''), 'Coste auxiliar') description, c.quantity, c.unit_price, c.total_price subtotal from public.work_order_cost_entries c where c.company_id = v_work.company_id and c.work_order_id = v_work.id and c.deleted_at is null and coalesce(c.source, 'manual') <> 'quote' and c.contributes_to_sale loop
       if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, trim(v_line.description), coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
    end loop;
  end if;

  select round(coalesce(sum(subtotal), 0), 2) into v_actual from public.invoice_work_orders where invoice_id = v_invoice and deleted_at is null;
  if not v_attached or v_actual <> v_expected then v_detail_status := 'inconsistent'; v_notes := concat_ws(E'\n', nullif(trim(p_notes), ''), format('ADVERTENCIA ECONÓMICA: total aprobado %s EUR; suma de líneas %s EUR; diferencia %s EUR. La emisión requiere excepción autorizada.', to_char(v_expected, 'FM999999990.00'), to_char(v_actual, 'FM999999990.00'), to_char(v_actual - v_expected, 'FM999999990.00'))); end if;
  update public.invoices set notes = coalesce(v_notes, notes), subtotal = v_actual, tax_amount = round(v_actual * v_tax / 100, 2), total_amount = round(v_actual * (1 + v_tax / 100), 2), economic_expected_amount = v_expected, economic_actual_amount = v_actual, economic_detail_status = v_detail_status, updated_at = now(), updated_by = v_actor.id where id = v_invoice;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_work.company_id, 'invoices', v_invoice, 'INVOICE_DRAFT_CREATE', v_actor.id, null, jsonb_build_object('work_order_id', v_work.id, 'expected_amount', v_expected, 'actual_amount', v_actual, 'economic_detail_status', v_detail_status));
  return v_invoice;
end;
$$;

create or replace function public.dmp_update_invoice_draft(p_invoice_id uuid, p_lines jsonb, p_due_date date default null, p_notes text default null, p_tax_rate numeric default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_actor public.profiles := public.dmp024_active_profile(); v_invoice public.invoices; v_line jsonb; v_qty numeric; v_price numeric; v_discount numeric; v_tax numeric; v_subtotal numeric; v_tax_amount numeric; v_total numeric; v_work_id uuid; v_source_work_id uuid; v_expected numeric; v_actual numeric; v_status text := 'complete'; v_work_count integer;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para editar borradores'; end if;
  if jsonb_typeof(p_lines) <> 'array' then raise exception 'factura: las lineas deben ser un array'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status <> 'borrador' then raise exception 'factura: solo se pueden editar borradores'; end if;
   select work_order_id into v_source_work_id from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null and work_order_id is not null limit 1;
   select count(distinct work_order_id) into v_work_count from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null and work_order_id is not null;
   if v_work_count > 1 then raise exception 'factura: este borrador mezcla varios partes y 099 solo permite un parte por factura'; end if;
  v_tax := coalesce(p_tax_rate, v_invoice.tax_rate);
  if v_tax < 0 then raise exception 'factura: IVA no valido'; end if;
  delete from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    if trim(coalesce(v_line->>'description', '')) = '' then raise exception 'factura: cada linea necesita descripcion'; end if;
    v_qty := coalesce(nullif(v_line->>'quantity', '')::numeric, 1); v_price := coalesce(nullif(v_line->>'unit_price', '')::numeric, 0); v_discount := coalesce(nullif(v_line->>'discount', '')::numeric, 0);
    if v_qty < 0 or v_price < 0 or v_discount < 0 or v_discount > 100 then raise exception 'factura: importe, cantidad o descuento no valido'; end if;
     v_tax_amount := coalesce(nullif(v_line->>'tax_rate', '')::numeric, v_tax); v_work_id := nullif(v_line->>'work_order_id', '')::uuid;
     if v_source_work_id is not null then v_work_id := coalesce(v_work_id, v_source_work_id); if v_work_id <> v_source_work_id then raise exception 'factura: todas las lineas del borrador deben pertenecer al mismo parte'; end if; end if;
    if v_work_id is not null and (not public.dmp_guided_billing_eligible(v_work_id) or not exists (select 1 from public.work_orders w where w.id = v_work_id and w.company_id = v_invoice.company_id)) then raise exception 'factura: parte asociado no valido para este borrador'; end if;
    v_subtotal := round(v_qty * v_price * (1 - v_discount / 100), 2); v_tax_amount := round(v_subtotal * v_tax_amount / 100, 2); v_total := round(v_subtotal + v_tax_amount, 2);
    insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_invoice.company_id, v_invoice.id, v_work_id, trim(v_line->>'description'), v_qty, v_price, v_discount, v_subtotal, coalesce(nullif(v_line->>'tax_rate', '')::numeric, v_tax), v_tax_amount, v_total);
  end loop;
   if v_source_work_id is not null and (not exists (select 1 from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null and work_order_id = v_source_work_id) or exists (select 1 from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null and work_order_id is null)) then raise exception 'factura: el borrador debe conservar el mismo parte en todas sus lineas'; end if;
  select round(coalesce(sum(subtotal), 0), 2) into v_actual from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null;
  select coalesce(i.economic_expected_amount, w.sale_amount, 0) into v_expected from public.invoices i left join public.work_orders w on w.id = v_source_work_id where i.id = v_invoice.id;
  if v_source_work_id is not null and round(v_actual, 2) <> round(v_expected, 2) then v_status := 'inconsistent'; end if;
  update public.invoices set due_date = p_due_date, notes = nullif(trim(p_notes), ''), tax_rate = v_tax, subtotal = v_actual, tax_amount = round(v_actual * v_tax / 100, 2), total_amount = round(v_actual * (1 + v_tax / 100), 2), economic_actual_amount = v_actual, economic_detail_status = v_status, economic_override_reason = null, economic_override_by = null, economic_override_at = null, updated_by = v_actor.id, updated_at = now() where id = v_invoice.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_invoice.company_id, 'invoices', v_invoice.id, 'INVOICE_DRAFT_UPDATE', v_actor.id, to_jsonb(v_invoice), jsonb_build_object('actual_amount', v_actual, 'economic_detail_status', v_status));
end;
$$;

create or replace function public.dmp_issue_invoice(p_invoice_id uuid, p_override boolean default false, p_override_reason text default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_actor public.profiles := public.dmp024_active_profile(); v_invoice public.invoices; v_work public.work_orders; v_company public.companies; v_client public.clients; v_site public.sites; v_quote public.quotes; v_base text; v_next integer; v_subtotal numeric; v_tax numeric; v_total numeric; v_invalid integer; v_snapshot jsonb; v_reason text := trim(coalesce(p_override_reason, '')); v_work_count integer; v_current_economics jsonb; v_current_sale numeric; v_stale boolean;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para emitir facturas'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status <> 'borrador' then raise exception 'factura: solo se pueden emitir borradores'; end if;
  select count(*) filter (where total_amount <= 0 or subtotal < 0 or tax_amount < 0), coalesce(sum(subtotal), 0), coalesce(sum(tax_amount), 0), coalesce(sum(total_amount), 0) into v_invalid, v_subtotal, v_tax, v_total from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null;
  if not exists (select 1 from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null) or v_invalid > 0 or v_total <= 0 then raise exception 'factura: el borrador necesita al menos una linea valida y un total mayor que cero'; end if;
   if p_override and v_reason = '' then raise exception 'factura: el motivo de excepcion es obligatorio'; end if;
   if p_override and not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: el rol actual no puede emitir con excepcion'; end if;
   select count(distinct l.work_order_id) into v_work_count from public.invoice_work_orders l where l.invoice_id = v_invoice.id and l.deleted_at is null and l.work_order_id is not null;
   if v_work_count <> 1 then raise exception 'factura: 099 requiere exactamente un parte por factura'; end if;
   select w.* into v_work from public.invoice_work_orders l join public.work_orders w on w.id = l.work_order_id where l.invoice_id = v_invoice.id and l.deleted_at is null and l.work_order_id is not null order by l.id limit 1;
    if v_work.id is null or v_work.company_id <> v_invoice.company_id or v_work.deleted_at is not null or not public.dmp_guided_billing_eligible(v_work.id) then raise exception 'factura: existe un parte asociado no valido'; end if;
    if v_work.economic_review_status <> 'approved' and not (v_work.economic_review_status = 'not_started' and v_work.economic_status = 'pendiente_facturar' and v_work.office_validation_status = 'validated') then raise exception 'factura: la revision economica del parte no esta aprobada'; end if;
    if exists (select 1 from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null and (work_order_id is null or work_order_id <> v_work.id)) then raise exception 'factura: todas las lineas activas deben conservar el parte asociado'; end if;
   v_current_economics := public.dmp_calculate_work_order_economics(v_work.id);
   v_current_sale := round((v_current_economics->>'sale_amount')::numeric, 2);
   v_stale := round(coalesce(v_invoice.economic_expected_amount, v_current_sale), 2) <> v_current_sale or round(v_subtotal, 2) <> v_current_sale;
   if v_stale and not p_override then raise exception 'factura: el borrador esta obsoleto respecto a la economia aprobada; requiere excepcion autorizada'; end if;
   if not v_stale and p_override then raise exception 'factura: la excepcion solo aplica a una inconsistencia economica real'; end if;
  select * into v_client from public.clients where id = v_work.client_id; select * into v_site from public.sites where id = v_work.site_id; select * into v_quote from public.quotes where id = v_work.quote_id; select * into v_company from public.companies where id = v_invoice.company_id;
  v_snapshot := jsonb_build_object('emitter', jsonb_build_object('name', v_company.name, 'trade_name', v_company.trade_name, 'tax_id', v_company.tax_id, 'address', v_company.address, 'postal_code', v_company.postal_code, 'city', v_company.city, 'province', v_company.province, 'country', v_company.country, 'phone', v_company.phone, 'email', v_company.email, 'website', v_company.website), 'client', jsonb_build_object('legal_name', v_client.legal_name, 'trade_name', v_client.trade_name, 'tax_id', v_client.tax_id, 'address', v_client.address, 'postal_code', v_client.postal_code, 'city', v_client.city, 'province', v_client.province, 'country', v_client.country, 'phone', v_client.phone, 'email', v_client.email), 'work', jsonb_build_object('code', v_work.code, 'title', v_work.title, 'site_name', v_site.name, 'site_code', v_site.code, 'quote_code', v_quote.code), 'lines', coalesce((select jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity, 'unit_price', l.unit_price, 'discount', l.discount, 'subtotal', l.subtotal, 'tax_rate', l.tax_rate, 'tax_amount', l.tax_amount, 'total_amount', l.total_amount) order by l.id) from public.invoice_work_orders l where l.invoice_id = v_invoice.id and l.deleted_at is null), '[]'::jsonb), 'totals', jsonb_build_object('subtotal', v_subtotal, 'tax_rate', v_invoice.tax_rate, 'tax_amount', v_tax, 'total_amount', v_total, 'issue_date', current_date, 'due_date', v_invoice.due_date, 'notes', v_invoice.notes));
  v_base := 'FAC-' || to_char(current_date, 'YYYY-'); perform pg_advisory_xact_lock(hashtextextended(v_invoice.company_id::text || ':invoice:' || v_base, 0));
  select coalesce(max(substring(code from length(v_base) + 1)::integer), 0) + 1 into v_next from public.invoices where company_id = v_invoice.company_id and code like v_base || '%' and substring(code from length(v_base) + 1) ~ '^[0-9]+$';
   update public.invoices set code = v_base || lpad(v_next::text, 6, '0'), status = 'emitida', issue_date = current_date, subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total, fiscal_snapshot = v_snapshot, economic_expected_amount = v_current_sale, economic_actual_amount = v_subtotal, economic_detail_status = case when p_override then 'overridden' else 'complete' end, economic_override_reason = case when p_override then v_reason else null end, economic_override_by = case when p_override then v_actor.id else null end, economic_override_at = case when p_override then now() else null end, updated_by = v_actor.id, updated_at = now() where id = v_invoice.id;
   update public.work_orders w set invoiced_amount = totals.subtotal, paid_amount = 0, economic_status = 'facturado', updated_by = v_actor.id, updated_at = now() from (select work_order_id, round(sum(subtotal), 2) subtotal from public.invoice_work_orders where invoice_id = v_invoice.id and deleted_at is null and work_order_id is not null group by work_order_id) totals where totals.work_order_id = w.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_invoice.company_id, 'invoices', v_invoice.id, case when p_override then 'INVOICE_ISSUE_OVERRIDE' else 'INVOICE_ISSUE' end, v_actor.id, to_jsonb(v_invoice), jsonb_build_object('code', v_base || lpad(v_next::text, 6, '0'), 'subtotal', v_subtotal, 'tax_amount', v_tax, 'total_amount', v_total, 'fiscal_snapshot', true, 'expected_amount', v_current_sale, 'actual_amount', v_subtotal, 'previous_expected_amount', v_invoice.economic_expected_amount, 'previous_actual_amount', v_invoice.economic_actual_amount, 'override_reason', nullif(v_reason, '')));
  return v_invoice.id;
end;
$$;

create or replace function public.dmp_issue_invoice(p_invoice_id uuid)
returns uuid language sql security definer set search_path = public
as $$
  select public.dmp_issue_invoice(p_invoice_id, false, null);
$$;

revoke all on function public.dmp_calculate_work_order_economics(uuid) from public, anon, authenticated;
revoke all on function public.dmp_review_work_order_economic(uuid, jsonb, text) from public, anon;
grant execute on function public.dmp_review_work_order_economic(uuid, jsonb, text) to authenticated;
revoke all on function public.dmp_finalize_work_order_technical(uuid, jsonb) from public, anon;
grant execute on function public.dmp_finalize_work_order_technical(uuid, jsonb) to authenticated;
revoke all on function public.dmp_prepare_invoice_from_work_order(uuid, date, text, numeric) from public, anon;
grant execute on function public.dmp_prepare_invoice_from_work_order(uuid, date, text, numeric) to authenticated;
revoke all on function public.dmp_update_invoice_draft(uuid, jsonb, date, text, numeric) from public, anon;
grant execute on function public.dmp_update_invoice_draft(uuid, jsonb, date, text, numeric) to authenticated;
revoke all on function public.dmp_issue_invoice(uuid, boolean, text) from public, anon;
grant execute on function public.dmp_issue_invoice(uuid, boolean, text) to authenticated;
revoke all on function public.dmp_issue_invoice(uuid) from public, anon;
grant execute on function public.dmp_issue_invoice(uuid) to authenticated;

commit;
