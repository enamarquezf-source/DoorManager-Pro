-- DoorManager Pro - safe purchase order archival. No physical deletion.
begin;

alter table public.purchase_orders
  add column if not exists archived_at timestamptz;

create index if not exists purchase_orders_company_archived_idx
  on public.purchase_orders(company_id, archived_at, order_date desc);

create or replace function public.dmp_archive_purchase_order(p_purchase_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
  v_actor public.profiles;
  v_old jsonb;
  v_new jsonb;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into v_order
  from public.purchase_orders
  where id = p_purchase_order_id
    and company_id = public.current_company_id()
  for update;
  if not found then raise exception 'Pedido de compra no encontrado'; end if;
  if v_order.status not in ('cancelled', 'received') then
    raise exception 'Solo se pueden archivar pedidos cancelados o recibidos';
  end if;
  if v_order.archived_at is not null then raise exception 'El pedido ya está archivado'; end if;
  if not (public.has_permission('purchase_orders.update') or public.is_platform_superadmin()) then
    raise exception 'No tienes permisos para archivar pedidos de compra';
  end if;

  if auth.uid() is null then raise exception 'Operacion no permitida para usuarios anonimos'; end if;
  select * into v_actor
  from public.profiles
  where id = public.current_profile_id()
    and auth_user_id = auth.uid()
    and company_id = v_order.company_id
    and active = true
    and deleted_at is null;
  if not found then raise exception 'Perfil no encontrado o inactivo'; end if;
  v_old := to_jsonb(v_order);
  update public.purchase_orders
   set archived_at = now(), updated_at = now()
   where id = v_order.id
   returning to_jsonb(purchase_orders.*) into v_new;
  perform public.dmp_record_lifecycle_audit(v_order.company_id, v_actor, 'purchase_orders', v_order.id, 'ARCHIVE', trim(p_reason), v_old, v_new);
  return v_new || jsonb_build_object('operation', 'archived');
end;
$$;

revoke all on function public.dmp_archive_purchase_order(uuid, text) from public, anon;
grant execute on function public.dmp_archive_purchase_order(uuid, text) to authenticated;

commit;
