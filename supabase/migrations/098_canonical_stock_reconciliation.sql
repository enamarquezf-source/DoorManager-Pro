-- DoorManager Pro - resolución administrativa de discrepancias de stock canónico.
-- No modifica materials.stock_quantity ni reutiliza las RPC de apertura inicial.
begin;

create table if not exists public.warehouse_stock_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  warehouse_id uuid not null references public.warehouses(id),
  material_id uuid not null references public.materials(id),
  resolution text not null check (resolution in ('CANONICAL_CONFIRMED','CANONICAL_ADJUSTED')),
  previous_quantity numeric(12,2) not null check (previous_quantity >= 0),
  confirmed_quantity numeric(12,2) not null check (confirmed_quantity >= 0),
  delta numeric(12,2) not null,
  reason text not null,
  resolved_by uuid not null references public.profiles(id),
  resolved_at timestamptz not null default now(),
  idempotency_key text not null,
  constraint warehouse_stock_reconciliations_idempotency_unique unique (company_id, idempotency_key),
  constraint warehouse_stock_reconciliations_material_warehouse_unique unique (company_id, warehouse_id, material_id)
);

create index if not exists warehouse_stock_reconciliations_lookup_idx
  on public.warehouse_stock_reconciliations(company_id, material_id, warehouse_id, resolved_at desc);

alter table public.warehouse_stock_reconciliations enable row level security;
drop policy if exists warehouse_stock_reconciliations_select_backoffice on public.warehouse_stock_reconciliations;
drop policy if exists warehouse_stock_reconciliations_block_direct_write on public.warehouse_stock_reconciliations;
create policy warehouse_stock_reconciliations_select_backoffice on public.warehouse_stock_reconciliations
  for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy warehouse_stock_reconciliations_block_direct_write on public.warehouse_stock_reconciliations
  for all to authenticated using (false) with check (false);

alter table public.audit_log drop constraint if exists audit_log_operation_check;
alter table public.audit_log add constraint audit_log_operation_check check (operation in (
  'INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE',
  'TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_DRAFT_CREATE',
  'INVOICE_DRAFT_UPDATE','INVOICE_ISSUE','PAYMENT_RECORD','MATERIAL_CREATE','WAREHOUSE_STOCK_RECONCILE'
));

create or replace function public.dmp_resolve_initial_stock_review(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_company_id uuid := public.current_company_id();
  v_warehouse public.warehouses;
  v_material public.materials;
  v_stock public.warehouse_stock;
  v_previous_reconciliation public.warehouse_stock_reconciliations;
  v_reconciliation public.warehouse_stock_reconciliations;
  v_old_stock jsonb;
  v_new_stock jsonb;
  v_action text := nullif(trim(p_payload->>'action'), '');
  v_warehouse_id uuid := nullif(p_payload->>'warehouse_id', '')::uuid;
  v_material_id uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_confirmed numeric := nullif(p_payload->>'confirmed_quantity', '')::numeric;
  v_delta numeric;
  v_reason text := trim(coalesce(p_payload->>'reason', ''));
  v_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_existing public.warehouse_stock_reconciliations;
begin
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then
    raise exception 'permiso: no tienes permiso para resolver discrepancias de stock';
  end if;
  if v_action not in ('accept_canonical','adjust_canonical') then
    raise exception 'validacion del formulario: accion de conciliacion no valida';
  end if;
  if v_warehouse_id is null or v_material_id is null then
    raise exception 'validacion del formulario: falta almacen o material';
  end if;
  if v_reason = '' then
    raise exception 'validacion del formulario: el motivo es obligatorio';
  end if;
  if v_key is null then
    raise exception 'validacion del formulario: falta idempotency_key';
  end if;
  select * into v_warehouse from public.warehouses
  where id = v_warehouse_id and company_id = v_company_id and active and deleted_at is null;
  select * into v_material from public.materials
  where id = v_material_id and company_id = v_company_id and deleted_at is null;
  if v_warehouse.id is null then raise exception 'stock: almacen no valido para la empresa'; end if;
  if v_material.id is null then raise exception 'material: material no valido para la empresa'; end if;
  if (select count(*) from public.warehouse_stock where company_id = v_company_id and material_id = v_material_id) > 1 then
    raise exception 'stock: el material requiere conciliacion por almacen';
  end if;
  select * into v_stock from public.warehouse_stock
  where company_id = v_company_id and warehouse_id = v_warehouse_id and material_id = v_material_id
  for update;
  if v_stock.id is null then raise exception 'stock: no existe saldo canónico para resolver'; end if;
  select * into v_existing from public.warehouse_stock_reconciliations
  where company_id = v_company_id and idempotency_key = v_key;
  if v_existing.id is not null then
    if v_existing.warehouse_id <> v_warehouse_id or v_existing.material_id <> v_material_id or
       (v_action = 'adjust_canonical' and v_existing.confirmed_quantity is distinct from v_confirmed) then
      raise exception 'conflicto: idempotency_key ya usada con otra conciliacion';
    end if;
    return v_existing.id;
  end if;
  if v_action = 'accept_canonical' then
    v_confirmed := v_stock.quantity;
  elsif v_confirmed is null or v_confirmed < 0 then
    raise exception 'validacion del formulario: la cantidad confirmada no puede ser negativa';
  end if;
  v_delta := v_confirmed - v_stock.quantity;
  v_old_stock := jsonb_build_object('warehouse_id', v_stock.warehouse_id, 'material_id', v_stock.material_id, 'quantity', v_stock.quantity);
  if v_delta <> 0 then
    update public.warehouse_stock set quantity = v_confirmed, updated_at = now() where id = v_stock.id;
    insert into public.stock_movements(company_id, warehouse_id, material_id, movement_type, quantity, created_by, notes, idempotency_key)
    values (
      v_company_id, v_warehouse_id, v_material_id, 'Ajuste', abs(v_delta), v_actor.id,
      jsonb_build_object('source','warehouse_stock_reconciliation','previous_quantity',v_stock.quantity,'confirmed_quantity',v_confirmed,'delta',v_delta,'reason',v_reason)::text,
      'canonical-reconciliation:' || v_key
    );
  end if;
  insert into public.warehouse_stock_reconciliations(company_id, warehouse_id, material_id, resolution, previous_quantity, confirmed_quantity, delta, reason, resolved_by, idempotency_key)
  values (
    v_company_id, v_warehouse_id, v_material_id,
    case when v_delta = 0 then 'CANONICAL_CONFIRMED' else 'CANONICAL_ADJUSTED' end,
    v_stock.quantity, v_confirmed, v_delta, v_reason, v_actor.id, v_key
  ) returning * into v_reconciliation;
  v_new_stock := jsonb_build_object('warehouse_id', v_stock.warehouse_id, 'material_id', v_stock.material_id, 'quantity', v_confirmed, 'reconciliation_id', v_reconciliation.id, 'resolution', v_reconciliation.resolution, 'reason', v_reason);
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_company_id, 'warehouse_stock', v_stock.id, 'WAREHOUSE_STOCK_RECONCILE', v_actor.id,
    jsonb_build_object('stock', v_old_stock, 'material_id', v_material_id, 'warehouse_id', v_warehouse_id),
    v_new_stock
  );
  return v_reconciliation.id;
exception when unique_violation then
  select id into v_reconciliation from public.warehouse_stock_reconciliations where company_id = v_company_id and idempotency_key = v_key;
  if v_reconciliation.id is not null then return v_reconciliation.id; end if;
  raise exception 'conflicto: la conciliacion ya fue registrada por otro usuario';
end;
$$;

revoke all on function public.dmp_resolve_initial_stock_review(jsonb) from public;
revoke all on function public.dmp_resolve_initial_stock_review(jsonb) from anon;
grant execute on function public.dmp_resolve_initial_stock_review(jsonb) to authenticated;

commit;
