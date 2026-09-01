-- DoorManager Pro - corrige el importe base de presupuestos al preparar facturas.
-- Usa la base imponible historica del presupuesto y no modifica quotes.

begin;

create or replace function public.dmp_prepare_invoice_from_work_order(p_work_order_id uuid, p_due_date date default null, p_notes text default null, p_tax_rate numeric default 21)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile(); v_work public.work_orders; v_existing uuid; v_existing_status text; v_existing_count integer; v_invoice uuid; v_tax numeric := coalesce(p_tax_rate, 0); v_line record; v_attached boolean := false; v_expected numeric; v_actual numeric; v_detail_status text := 'complete'; v_notes text; v_quote numeric; v_quote_lines_total numeric := 0; v_quote_accum numeric := 0; v_line_subtotal numeric; v_line_discount numeric;
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
    select round(coalesce(q.taxable_base, q.subtotal_sale, q.subtotal, 0), 2) into v_quote from public.quotes q where q.id = v_work.quote_id and q.company_id = v_work.company_id and q.deleted_at is null and q.status in ('Aceptado','Ejecutado en cliente');
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
      if v_line.subtotal > 0 then insert into public.invoice_work_orders(company_id, invoice_id, work_order_id, description, quantity, unit_price, discount, subtotal, tax_rate, tax_amount, total_amount) values (v_work.company_id, v_invoice, v_work.id, v_line.description, coalesce(v_line.quantity, 1), v_line.unit_price, 0, v_line.subtotal, v_tax, round(v_line.subtotal * v_tax / 100, 2), round(v_line.subtotal * (1 + v_tax / 100), 2)); v_attached := true; end if;
    end loop;
  end if;

  select round(coalesce(sum(subtotal), 0), 2) into v_actual from public.invoice_work_orders where invoice_id = v_invoice and deleted_at is null;
  if not v_attached or v_actual <> v_expected then v_detail_status := 'inconsistent'; v_notes := concat_ws(E'\n', nullif(trim(p_notes), ''), format('ADVERTENCIA ECONÓMICA: total aprobado %s EUR; suma de líneas %s EUR; diferencia %s EUR. La emisión requiere excepción autorizada.', to_char(v_expected, 'FM999999990.00'), to_char(v_actual, 'FM999999990.00'), to_char(v_actual - v_expected, 'FM999999990.00'))); end if;
  update public.invoices set notes = coalesce(v_notes, notes), subtotal = v_actual, tax_amount = round(v_actual * v_tax / 100, 2), total_amount = round(v_actual * (1 + v_tax / 100), 2), economic_expected_amount = v_expected, economic_actual_amount = v_actual, economic_detail_status = v_detail_status, updated_at = now(), updated_by = v_actor.id where id = v_invoice;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_work.company_id, 'invoices', v_invoice, 'INVOICE_DRAFT_CREATE', v_actor.id, null, jsonb_build_object('work_order_id', v_work.id, 'expected_amount', v_expected, 'actual_amount', v_actual, 'economic_detail_status', v_detail_status));
  return v_invoice;
end;
$$;

commit;
