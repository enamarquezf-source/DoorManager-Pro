begin;

-- Invoker preserves table grants, RLS, financial guards and audit triggers.
-- All rows are committed together; no exception is swallowed or partial fallback used.
create or replace function public.dmp_create_supplier_invoice_atomic(
 p_operation_id uuid, p_header jsonb, p_lines jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 actor uuid := public.current_profile_id();
 company uuid := public.current_company_id();
 result public.supplier_invoices;
 item jsonb;
 allocation jsonb;
 line_id uuid;
begin
 if actor is null or company is null or not exists (
  select 1 from public.profiles p where p.id=actor and p.company_id=company
   and p.active and p.deleted_at is null
 ) then raise exception 'permiso: perfil activo obligatorio'; end if;
 if not public.is_platform_superadmin() and not (
  public.has_permission('supplier_invoices.create') and public.has_permission('supplier_invoices.read')
 ) then raise exception 'permiso: no puedes crear facturas de proveedor'; end if;
 if p_operation_id is null then
  raise exception 'validacion del formulario: falta el identificador de la operacion';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,167));
 select * into result from public.supplier_invoices where id=p_operation_id;
 if found then
  if result.company_id is distinct from company or result.created_by is distinct from actor then
   raise exception 'permiso: operacion de factura no disponible';
  end if;
  -- A recovered invoice may already be registered. Never append lines on retry.
  return to_jsonb(result)||jsonb_build_object('recovered',true);
 end if;
 if jsonb_typeof(p_header) is distinct from 'object'
  or nullif(p_header->>'supplier_id','') is null
  or jsonb_typeof(p_lines) is distinct from 'array' then
  raise exception 'validacion del formulario: proveedor o lineas no validos';
 end if;
 if jsonb_array_length(p_lines)>0 and not (
  public.has_permission('supplier_invoices.update') or public.is_platform_superadmin()
 ) then raise exception 'permiso: no puedes anadir lineas de factura'; end if;
 insert into public.supplier_invoices(id,company_id,code,supplier_id,supplier_invoice_number,
  invoice_date,due_date,currency_code,notes,created_by,updated_by)
 values(p_operation_id,company,public.next_dmp_code(company,'supplier_invoices','FPR',true,6),
  (p_header->>'supplier_id')::uuid,nullif(btrim(p_header->>'supplier_invoice_number'),''),
  coalesce(nullif(p_header->>'invoice_date','')::date,current_date),
  nullif(p_header->>'due_date','')::date,coalesce(nullif(p_header->>'currency_code',''),'EUR'),
  nullif(p_header->>'notes',''),actor,actor);
 for item in select value from jsonb_array_elements(p_lines) loop
  if jsonb_typeof(item) is distinct from 'object' then
   raise exception 'validacion del formulario: linea no valida';
  end if;
  insert into public.supplier_invoice_lines(company_id,supplier_invoice_id,description,
   material_id,quantity,unit_price,tax_rate)
  values(company,p_operation_id,item->>'description',nullif(item->>'material_id','')::uuid,
   (item->>'quantity')::numeric,(item->>'unit_price')::numeric,
   coalesce((item->>'tax_rate')::numeric,21)) returning id into line_id;
  allocation := item->'allocation';
  if allocation is not null and allocation <> 'null'::jsonb then
   if jsonb_typeof(allocation) is distinct from 'object' then
    raise exception 'validacion del formulario: vinculacion no valida';
   end if;
   insert into public.supplier_invoice_allocations(company_id,created_by,supplier_invoice_id,
    supplier_invoice_line_id,purchase_order_id,purchase_order_line_id,purchase_receipt_id,
    purchase_receipt_line_id,allocated_quantity,allocated_amount)
   values(company,actor,p_operation_id,line_id,
    nullif(allocation->>'purchase_order_id','')::uuid,
    nullif(allocation->>'purchase_order_line_id','')::uuid,
    nullif(allocation->>'purchase_receipt_id','')::uuid,
    nullif(allocation->>'purchase_receipt_line_id','')::uuid,
    nullif(allocation->>'allocated_quantity','')::numeric,
    round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,2));
  end if;
 end loop;
 select * into result from public.supplier_invoices where id=p_operation_id;
 return to_jsonb(result)||jsonb_build_object('recovered',false);
end;
$$;
revoke all on function public.dmp_create_supplier_invoice_atomic(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.dmp_create_supplier_invoice_atomic(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
