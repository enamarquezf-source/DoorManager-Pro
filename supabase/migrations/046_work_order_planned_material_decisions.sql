-- DoorManager Pro - decisiones sobre materiales previstos de presupuesto.
-- No afecta stock. El stock se mueve solo al confirmar material usado con dmp_upsert_work_order_material.

begin;

create table if not exists public.work_order_planned_material_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  quote_line_id uuid not null references public.quote_lines(id),
  decision text not null check (decision in ('utilizado','no_utilizado')),
  work_order_material_id uuid references public.work_order_materials(id),
  quantity numeric(12,2),
  unit text,
  notes text,
  decided_by uuid not null references public.profiles(id),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_order_planned_material_decisions_unique unique (company_id, work_order_id, quote_line_id)
);

create index if not exists work_order_planned_material_decisions_work_idx on public.work_order_planned_material_decisions(company_id, work_order_id) where deleted_at is null;
create index if not exists work_order_planned_material_decisions_quote_line_idx on public.work_order_planned_material_decisions(quote_line_id) where deleted_at is null;

alter table public.work_order_planned_material_decisions enable row level security;

drop policy if exists work_order_planned_material_decisions_select_scoped on public.work_order_planned_material_decisions;
create policy work_order_planned_material_decisions_select_scoped on public.work_order_planned_material_decisions for select to authenticated
  using (
    deleted_at is null
    and (
      company_id = public.current_company_id()
      or public.is_platform_superadmin()
    )
  );

drop policy if exists work_order_planned_material_decisions_insert_block_direct on public.work_order_planned_material_decisions;
create policy work_order_planned_material_decisions_insert_block_direct on public.work_order_planned_material_decisions for insert to authenticated with check (false);
drop policy if exists work_order_planned_material_decisions_update_block_direct on public.work_order_planned_material_decisions;
create policy work_order_planned_material_decisions_update_block_direct on public.work_order_planned_material_decisions for update to authenticated using (false) with check (false);
drop policy if exists work_order_planned_material_decisions_delete_block_direct on public.work_order_planned_material_decisions;
create policy work_order_planned_material_decisions_delete_block_direct on public.work_order_planned_material_decisions for delete to authenticated using (false);

create or replace function public.dmp_set_work_order_planned_material_decision(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_quote_line public.quote_lines;
  v_material_usage public.work_order_materials;
  v_decision text := nullif(p_payload->>'decision', '');
  v_id uuid;
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  if nullif(p_payload->>'quote_line_id', '') is null then raise exception 'validacion del formulario: falta quote_line_id'; end if;
  if v_decision not in ('utilizado','no_utilizado') then raise exception 'validacion del formulario: decision de material previsto no valida'; end if;

  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  select * into v_quote_line from public.quote_lines where id = (p_payload->>'quote_line_id')::uuid and company_id = v_work.company_id and deleted_at is null;
  if v_quote_line.id is null then raise exception 'presupuesto: linea prevista no encontrada'; end if;
  if v_work.quote_id is null or not exists (select 1 from public.quotes q where q.id = v_work.quote_id and q.company_id = v_work.company_id and q.id = v_quote_line.quote_id and q.deleted_at is null) then
    raise exception 'presupuesto: linea prevista no pertenece al presupuesto del parte';
  end if;

  if nullif(p_payload->>'work_order_material_id', '') is not null then
    select * into v_material_usage from public.work_order_materials where id = (p_payload->>'work_order_material_id')::uuid and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null;
    if v_material_usage.id is null then raise exception 'material: material utilizado no pertenece al parte'; end if;
  end if;
  if v_decision = 'utilizado' and v_material_usage.id is null then raise exception 'validacion del formulario: falta material utilizado confirmado'; end if;

  insert into public.work_order_planned_material_decisions(company_id, work_order_id, quote_line_id, decision, work_order_material_id, quantity, unit, notes, decided_by, decided_at, updated_at, deleted_at)
  values (v_work.company_id, v_work.id, v_quote_line.id, v_decision, v_material_usage.id, nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'unit', ''), nullif(p_payload->>'notes', ''), v_profile.id, now(), now(), null)
  on conflict (company_id, work_order_id, quote_line_id) do update
    set decision = excluded.decision,
        work_order_material_id = excluded.work_order_material_id,
        quantity = excluded.quantity,
        unit = excluded.unit,
        notes = excluded.notes,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now(),
        deleted_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on table public.work_order_planned_material_decisions from public, anon;
grant select on table public.work_order_planned_material_decisions to authenticated;
revoke all on function public.dmp_set_work_order_planned_material_decision(jsonb) from public;
revoke all on function public.dmp_set_work_order_planned_material_decision(jsonb) from anon;
grant execute on function public.dmp_set_work_order_planned_material_decision(jsonb) to authenticated;

commit;
