-- DoorManager Pro - allocate invoice collections across linked work orders.
-- paid_amount is the net economic amount actually collected and attributable
-- to each work order. Manual invoice lines are never assigned to a work order.
begin;

create or replace function public.dmp_refresh_invoice_collection(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.invoices;
  v_paid numeric;
  v_invoice_net numeric;
  v_paid_net numeric;
  v_linked_net numeric;
  v_manual_net numeric;
  v_linked_paid_net numeric;
  v_distributable numeric;
  v_allocated numeric:=0;
  v_amount numeric;
  v_row record;
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if v_invoice.id is null then raise exception 'factura: factura no encontrada'; end if;
  select round(coalesce(sum(amount),0),2) into v_paid
  from public.invoice_payments
  where invoice_id=v_invoice.id and company_id=v_invoice.company_id and reversed_at is null;
  if v_paid>v_invoice.total_amount then raise exception 'cobro: el total cobrado supera el importe de la factura'; end if;

  update public.invoices
  set paid_amount=v_paid,
      status=case when status='cancelada' then status when v_paid>=total_amount and total_amount>0 then 'cobrada' when v_paid>0 then 'parcialmente_cobrada' else 'emitida' end,
      updated_at=now()
  where id=v_invoice.id
  returning * into v_invoice;

  select
    round(coalesce(sum(l.subtotal) filter (where l.work_order_id is not null),0),2),
    round(coalesce(sum(l.subtotal) filter (where l.work_order_id is null),0),2)
  into v_linked_net, v_manual_net
  from public.invoice_work_orders l
  where l.invoice_id=v_invoice.id and l.company_id=v_invoice.company_id and l.deleted_at is null;

  v_invoice_net:=round(coalesce(v_invoice.subtotal,0),2);
  v_paid_net:=case when v_invoice.total_amount>0 then round(least(v_invoice_net,v_paid/v_invoice.total_amount*v_invoice_net),2) else 0 end;
  v_linked_paid_net:=case when v_invoice_net>0 and v_linked_net>0
    then round(least(v_linked_net,v_paid_net*v_linked_net/v_invoice_net),2)
    else 0 end;
  v_distributable:=v_linked_paid_net;

  perform 1
  from public.work_orders w
  join public.invoice_work_orders l on l.work_order_id=w.id
  where l.invoice_id=v_invoice.id and l.company_id=v_invoice.company_id and w.company_id=v_invoice.company_id and l.deleted_at is null
  for update;

  if exists(select 1 from public.invoice_work_orders l where l.invoice_id=v_invoice.id and l.company_id=v_invoice.company_id and l.deleted_at is null and l.work_order_id is not null) then
    for v_row in
      select l.work_order_id,
             round(sum(l.subtotal),2) as work_net,
             row_number() over(order by l.work_order_id::text) as row_no,
             count(*) over() as row_count
      from public.invoice_work_orders l
      where l.invoice_id=v_invoice.id and l.company_id=v_invoice.company_id and l.deleted_at is null and l.work_order_id is not null
      group by l.work_order_id
      order by l.work_order_id::text
    loop
      if v_linked_net<=0 or v_distributable<=0 then
        v_amount:=0;
      elsif v_row.row_no=v_row.row_count then
        v_amount:=round(v_distributable-v_allocated,2);
      else
        v_amount:=round(v_distributable*v_row.work_net/v_linked_net,2);
      end if;
      v_amount:=greatest(v_amount,0);
      v_allocated:=round(v_allocated+v_amount,2);
      update public.work_orders
      set paid_amount=v_amount,
          economic_status=case when v_invoice.status='cobrada' then 'cobrado' else 'facturado' end,
          updated_at=now()
      where id=v_row.work_order_id and company_id=v_invoice.company_id;
    end loop;
  end if;
end $$;

revoke all on function public.dmp_refresh_invoice_collection(uuid) from public,anon,authenticated;

commit;
