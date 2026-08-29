-- DoorManager Pro - borrado transaccional y restringido de borradores.
-- Los documentos emitidos nunca pasan por esta operacion.

begin;

create or replace function public.dmp_delete_invoice_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_invoice public.invoices;
  v_lines jsonb;
  v_line_count integer;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then
    raise exception 'permiso: no tienes permiso para eliminar borradores';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'factura: borrador no encontrado';
  end if;

  perform public.assert_member_of_current_company(v_invoice.company_id);

  if v_invoice.status <> 'borrador' then
    raise exception 'factura: solo se pueden eliminar borradores';
  end if;
  if v_invoice.code is not null then
    raise exception 'factura: el borrador tiene numero fiscal y no puede eliminarse';
  end if;
  if v_invoice.fiscal_snapshot is not null then
    raise exception 'factura: el borrador tiene snapshot fiscal y no puede eliminarse';
  end if;
  if exists (select 1 from public.invoice_payments where invoice_id = v_invoice.id) then
    raise exception 'factura: existen movimientos de cobro y el borrador no puede eliminarse';
  end if;

  select count(*), coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb)
    into v_line_count, v_lines
  from public.invoice_work_orders l
  where l.invoice_id = v_invoice.id;

  -- DELETE is an existing audit operation; no new audit constraint value is needed.
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (
    v_invoice.company_id,
    'invoices',
    v_invoice.id,
    'DELETE',
    jsonb_build_object('invoice', to_jsonb(v_invoice), 'lines', v_lines),
    jsonb_build_object('reason', 'DELETE_INVOICE_DRAFT', 'line_count', v_line_count)
  );

  delete from public.invoice_work_orders where invoice_id = v_invoice.id;
  delete from public.invoices where id = v_invoice.id and status = 'borrador';

  if not found then
    raise exception 'factura: el borrador cambio durante la eliminacion';
  end if;
end;
$$;

revoke all on function public.dmp_delete_invoice_draft(uuid) from public, anon;
grant execute on function public.dmp_delete_invoice_draft(uuid) to authenticated;

commit;
