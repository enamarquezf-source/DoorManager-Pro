-- Número de proveedor opcional para todas las facturas, actuales y futuras.
-- Conserva rol, empresa, estado, importes, auditoría y código interno.
begin;

create or replace function public.dmp_register_supplier_invoice(p_supplier_invoice_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invoice public.supplier_invoices; v_actor public.profiles := public.dmp024_active_profile(); v_line_count integer; v_subtotal numeric; v_tax numeric; v_total numeric;
begin
  if not (public.has_permission('supplier_invoices.register') or public.is_platform_superadmin()) then raise exception 'permiso: no puedes registrar facturas de proveedor'; end if;
  select * into v_invoice from public.supplier_invoices where id = p_supplier_invoice_id for update;
  if not found or (not public.is_platform_superadmin() and v_invoice.company_id <> public.current_company_id()) then raise exception 'factura proveedor: registro no disponible'; end if;
  if v_invoice.status <> 'draft' then raise exception 'factura proveedor: solo se puede registrar un borrador'; end if;
  -- El número externo es opcional; el código interno FPR identifica la factura.
  if not exists (select 1 from public.suppliers where company_id = v_invoice.company_id and id = v_invoice.supplier_id) then raise exception 'factura proveedor: proveedor no válido'; end if;
  select count(*), round(coalesce(sum(net_amount), 0), 2), round(coalesce(sum(tax_amount), 0), 2), round(coalesce(sum(total_amount), 0), 2) into v_line_count, v_subtotal, v_tax, v_total from public.supplier_invoice_lines where company_id = v_invoice.company_id and supplier_invoice_id = v_invoice.id;
  if v_line_count = 0 then raise exception 'factura proveedor: añade al menos una línea'; end if;
  if v_total <= 0 or v_subtotal < 0 or v_tax < 0 then raise exception 'factura proveedor: los importes no son válidos'; end if;
  perform set_config('dmp.supplier_invoice_lifecycle', 'register', true);
  update public.supplier_invoices set status = 'registered', subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_total, updated_by = v_actor.id where id = v_invoice.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_invoice.company_id, 'supplier_invoices', v_invoice.id, 'UPDATE', v_actor.id, to_jsonb(v_invoice), jsonb_build_object('status','registered','subtotal',v_subtotal,'tax_amount',v_tax,'total_amount',v_total,'lifecycle','registered'));
  return v_invoice.id;
end;
$$;

revoke all on function public.dmp_register_supplier_invoice(uuid) from public, anon;
grant execute on function public.dmp_register_supplier_invoice(uuid) to authenticated;

commit;
