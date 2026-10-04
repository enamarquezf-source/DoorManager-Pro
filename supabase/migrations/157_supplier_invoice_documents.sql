-- Adjuntos privados de facturas de proveedor y documentos DMP.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('dmp-invoice-documents', 'dmp-invoice-documents', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

create or replace function public.dmp_can_access_invoice_document(p_name text, p_write boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and public.has_permission('supplier_invoices.read')
    and public.has_permission('documents.read')
    and (not p_write or public.has_permission('documents.create'))
    and array_length(string_to_array(p_name, '/'), 1) = 4
    and split_part(p_name, '/', 3) in ('Proveedor','DMP')
    and exists (select 1 from public.supplier_invoices i
      where i.company_id = public.current_company_id()
        and i.company_id::text = split_part(p_name, '/', 1)
        and i.id::text = split_part(p_name, '/', 2));
$$;
revoke all on function public.dmp_can_access_invoice_document(text, boolean) from public, anon;
grant execute on function public.dmp_can_access_invoice_document(text, boolean) to authenticated;

drop policy if exists invoice_documents_read on storage.objects;
create policy invoice_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'dmp-invoice-documents' and public.dmp_can_access_invoice_document(name, false));
drop policy if exists invoice_documents_upload on storage.objects;
create policy invoice_documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'dmp-invoice-documents' and owner = auth.uid()
    and public.dmp_can_access_invoice_document(name, true));
-- Limpieza únicamente de subidas propias que todavía no se han registrado como documento.
drop policy if exists invoice_documents_cleanup on storage.objects;
create policy invoice_documents_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'dmp-invoice-documents' and owner = auth.uid()
    and public.dmp_can_access_invoice_document(name, true)
    and not exists (select 1 from public.files f where f.bucket = 'dmp-invoice-documents' and f.path = storage.objects.name));

create or replace function public.dmp_register_supplier_invoice_document(p_invoice_id uuid, p_origin text, p_path text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_invoice public.supplier_invoices;
  v_file_id uuid;
  v_document_id uuid;
  v_metadata jsonb;
begin
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id and company_id = public.current_company_id() for share;
  if not found or p_origin not in ('Proveedor','DMP') or p_origin is null
    or not public.dmp_can_access_invoice_document(p_path, true)
    or split_part(p_path, '/', 2) is distinct from p_invoice_id::text
    or split_part(p_path, '/', 3) is distinct from p_origin then
    raise exception 'factura proveedor: no tienes acceso para adjuntar este documento';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'factura proveedor: falta el nombre del archivo'; end if;
  select o.metadata into v_metadata from storage.objects o
    where o.bucket_id = 'dmp-invoice-documents' and o.name = p_path and o.owner = auth.uid();
  if not found then raise exception 'factura proveedor: el archivo no se ha subido correctamente'; end if;
  if coalesce(v_metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png','image/webp')
    or coalesce((v_metadata->>'size')::bigint, 0) <= 0
    or (v_metadata->>'size')::bigint > 10485760 then
    raise exception 'factura proveedor: adjunta un PDF o imagen de hasta 10 MB';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_path, 157));
  select d.id into v_document_id from public.documents d
    join public.files f on f.id = d.file_id and f.company_id = d.company_id
    join public.document_links l on l.document_id = d.id and l.company_id = d.company_id
    where d.company_id = v_invoice.company_id and f.bucket = 'dmp-invoice-documents' and f.path = p_path
      and l.related_type = 'Factura proveedor' and l.related_id = v_invoice.id and d.origin = p_origin;
  if found then return v_document_id; end if;

  insert into public.files(company_id, bucket, path, name, mime_type, size_bytes, uploaded_by, metadata)
    values (v_invoice.company_id, 'dmp-invoice-documents', p_path, left(trim(p_name), 255),
      v_metadata->>'mimetype', (v_metadata->>'size')::bigint, v_actor.id,
      jsonb_build_object('supplier_invoice_id', v_invoice.id, 'origin', p_origin)) returning id into v_file_id;
  insert into public.documents(company_id, title, type, origin, file_id, document_date)
    values (v_invoice.company_id, v_invoice.code || ' · ' || p_origin || ' · ' || left(trim(p_name), 255),
      'Factura proveedor', p_origin, v_file_id, v_invoice.invoice_date) returning id into v_document_id;
  insert into public.document_links(company_id, document_id, related_type, related_id)
    values (v_invoice.company_id, v_document_id, 'Factura proveedor', v_invoice.id);
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, new_data)
    values (v_invoice.company_id, 'documents', v_document_id, 'INSERT', v_actor.id,
      jsonb_build_object('supplier_invoice_id', v_invoice.id, 'origin', p_origin, 'file_id', v_file_id));
  return v_document_id;
end;
$$;
revoke all on function public.dmp_register_supplier_invoice_document(uuid, text, text, text) from public, anon;
grant execute on function public.dmp_register_supplier_invoice_document(uuid, text, text, text) to authenticated;
commit;
