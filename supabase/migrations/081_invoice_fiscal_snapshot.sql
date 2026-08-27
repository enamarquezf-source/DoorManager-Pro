-- DoorManager Pro - congela el documento fiscal al emitir una factura.
-- No almacena PDF: la factura estructurada es la fuente reproducible.

begin;

alter table public.invoices
  add column if not exists fiscal_snapshot jsonb;

create or replace function public.dmp_issue_invoice(p_invoice_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor public.profiles:=public.dmp024_active_profile();
  v_invoice public.invoices;
  v_work public.work_orders;
  v_company public.companies;
  v_client public.clients;
  v_site public.sites;
  v_quote public.quotes;
  v_id uuid;
  v_base text;
  v_next integer;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_invalid integer;
  v_snapshot jsonb;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para emitir facturas'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status<>'borrador' then raise exception 'factura: solo se pueden emitir borradores'; end if;
  select count(*) filter(where total_amount<=0 or subtotal<0 or tax_amount<0),coalesce(sum(subtotal),0),coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0) into v_invalid,v_subtotal,v_tax,v_total from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null;
  if not exists(select 1 from public.invoice_work_orders where invoice_id=v_invoice.id and deleted_at is null) or v_invalid>0 or v_total<=0 then raise exception 'factura: el borrador necesita al menos una linea valida y un total mayor que cero'; end if;
  if exists(select 1 from public.invoice_work_orders l left join public.work_orders w on w.id=l.work_order_id where l.invoice_id=v_invoice.id and l.deleted_at is null and (l.work_order_id is not null and (w.id is null or w.company_id<>v_invoice.company_id or w.office_validation_status<>'validated' or w.economic_status<>'pendiente_facturar' or coalesce(w.warranty,false) or not coalesce(w.billable,true)))) then raise exception 'factura: existe un parte asociado no valido'; end if;
  select w.* into v_work from public.invoice_work_orders l join public.work_orders w on w.id=l.work_order_id where l.invoice_id=v_invoice.id and l.deleted_at is null and l.work_order_id is not null order by l.id limit 1;
  select * into v_client from public.clients where id=v_work.client_id;
  select * into v_site from public.sites where id=v_work.site_id;
  select * into v_quote from public.quotes where id=v_work.quote_id;
  select * into v_company from public.companies where id=v_invoice.company_id;
  v_snapshot:=jsonb_build_object(
    'emitter', jsonb_build_object('name',v_company.name,'trade_name',v_company.trade_name,'tax_id',v_company.tax_id,'address',v_company.address,'postal_code',v_company.postal_code,'city',v_company.city,'province',v_company.province,'country',v_company.country,'phone',v_company.phone,'email',v_company.email,'website',v_company.website),
    'client', jsonb_build_object('legal_name',v_client.legal_name,'trade_name',v_client.trade_name,'tax_id',v_client.tax_id,'address',v_client.address,'postal_code',v_client.postal_code,'city',v_client.city,'province',v_client.province,'country',v_client.country,'phone',v_client.phone,'email',v_client.email),
    'work', jsonb_build_object('code',v_work.code,'title',v_work.title,'site_name',v_site.name,'site_code',v_site.code,'quote_code',v_quote.code),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity,'unit_price',l.unit_price,'discount',l.discount,'subtotal',l.subtotal,'tax_rate',l.tax_rate,'tax_amount',l.tax_amount,'total_amount',l.total_amount) order by l.id) from public.invoice_work_orders l where l.invoice_id=v_invoice.id and l.deleted_at is null),'[]'::jsonb),
    'totals', jsonb_build_object('subtotal',v_subtotal,'tax_rate',v_invoice.tax_rate,'tax_amount',v_tax,'total_amount',v_total,'issue_date',current_date,'due_date',v_invoice.due_date,'notes',v_invoice.notes)
  );
  v_base:='FAC-'||to_char(current_date,'YYYY-');
  perform pg_advisory_xact_lock(hashtextextended(v_invoice.company_id::text||':invoice:'||v_base,0));
  select coalesce(max(substring(code from length(v_base)+1)::integer),0)+1 into v_next from public.invoices where company_id=v_invoice.company_id and code like v_base||'%' and substring(code from length(v_base)+1)~'^[0-9]+$';
  v_id:=v_invoice.id;
  update public.invoices set code=v_base||lpad(v_next::text,6,'0'),status='emitida',issue_date=current_date,subtotal=v_subtotal,tax_amount=v_tax,total_amount=v_total,fiscal_snapshot=v_snapshot,updated_by=v_actor.id,updated_at=now() where id=v_id;
  update public.work_orders w set invoiced_amount=l.subtotal,paid_amount=0,economic_status='facturado',updated_by=v_actor.id,updated_at=now() from public.invoice_work_orders l where l.invoice_id=v_id and l.work_order_id=w.id and l.deleted_at is null;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(v_invoice.company_id,'invoices',v_id,'INVOICE_ISSUE',v_actor.id,to_jsonb(v_invoice),jsonb_build_object('code',v_base||lpad(v_next::text,6,'0'),'subtotal',v_subtotal,'tax_amount',v_tax,'total_amount',v_total,'fiscal_snapshot',true));
  return v_id;
end $$;

revoke all on function public.dmp_issue_invoice(uuid) from public,anon;
grant execute on function public.dmp_issue_invoice(uuid) to authenticated;

commit;
