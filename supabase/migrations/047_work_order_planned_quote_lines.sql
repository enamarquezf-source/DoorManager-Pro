-- DoorManager Pro - conceptos previstos de presupuesto vinculados a ejecucion real.
-- No toca 045/046. Materiales siguen por 046 y stock por dmp_upsert_work_order_material.

begin;

alter table public.work_order_cost_entries add column if not exists quote_line_id uuid references public.quote_lines(id);

create unique index if not exists work_order_cost_entries_quote_line_unique
  on public.work_order_cost_entries(company_id, work_order_id, quote_line_id)
  where quote_line_id is not null and deleted_at is null;

create table if not exists public.work_order_quote_line_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  quote_line_id uuid not null references public.quote_lines(id),
  decision text not null check (decision in ('confirmado','no_realizado')),
  work_order_cost_entry_id uuid references public.work_order_cost_entries(id),
  real_quantity numeric(12,2),
  real_unit text,
  real_unit_cost numeric(12,2),
  notes text,
  decided_by uuid not null references public.profiles(id),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_order_quote_line_decisions_unique unique (company_id, work_order_id, quote_line_id)
);

create index if not exists work_order_quote_line_decisions_work_idx on public.work_order_quote_line_decisions(company_id, work_order_id) where deleted_at is null;
create index if not exists work_order_quote_line_decisions_quote_line_idx on public.work_order_quote_line_decisions(quote_line_id) where deleted_at is null;

alter table public.work_order_quote_line_decisions enable row level security;

drop policy if exists work_order_quote_line_decisions_select_scoped on public.work_order_quote_line_decisions;
create policy work_order_quote_line_decisions_select_scoped on public.work_order_quote_line_decisions for select to authenticated
  using (deleted_at is null and (company_id = public.current_company_id() or public.is_platform_superadmin()));
drop policy if exists work_order_quote_line_decisions_insert_block_direct on public.work_order_quote_line_decisions;
create policy work_order_quote_line_decisions_insert_block_direct on public.work_order_quote_line_decisions for insert to authenticated with check (false);
drop policy if exists work_order_quote_line_decisions_update_block_direct on public.work_order_quote_line_decisions;
create policy work_order_quote_line_decisions_update_block_direct on public.work_order_quote_line_decisions for update to authenticated using (false) with check (false);
drop policy if exists work_order_quote_line_decisions_delete_block_direct on public.work_order_quote_line_decisions;
create policy work_order_quote_line_decisions_delete_block_direct on public.work_order_quote_line_decisions for delete to authenticated using (false);

create or replace function public.dmp_quote_line_cost_type(p_line_type text)
returns text
language sql
immutable
as $$
  select case p_line_type
    when 'transport' then 'desplazamiento'
    when 'travel' then 'desplazamiento'
    when 'mobile_workshop' then 'taller_movil'
    when 'lifting_platform' then 'plataforma_elevadora'
    when 'auxiliary_equipment' then 'medio_auxiliar'
    when 'external_cost' then 'coste_externo'
    when 'other' then 'otro'
    else null
  end;
$$;

create or replace function public.dmp_set_work_order_quote_line_decision(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_line public.quote_lines;
  v_decision text := nullif(p_payload->>'decision', '');
  v_cost_type text;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'real_quantity', '')::numeric);
  v_unit text := nullif(p_payload->>'unit', '');
  v_unit_cost numeric := nullif(p_payload->>'unit_cost', '')::numeric;
  v_cost_entry_id uuid;
  v_decision_id uuid;
  v_notes text := nullif(p_payload->>'notes', '');
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  if nullif(p_payload->>'quote_line_id', '') is null then raise exception 'validacion del formulario: falta quote_line_id'; end if;
  if v_decision not in ('confirmado','no_realizado') then raise exception 'validacion del formulario: decision de concepto previsto no valida'; end if;

  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  select * into v_line from public.quote_lines where id = (p_payload->>'quote_line_id')::uuid and company_id = v_work.company_id and deleted_at is null;
  if v_line.id is null then raise exception 'presupuesto: linea prevista no encontrada'; end if;
  if v_work.quote_id is null or v_line.quote_id <> v_work.quote_id then raise exception 'presupuesto: linea prevista no pertenece al presupuesto del parte'; end if;
  if v_line.line_type in ('material','labor','fee','discount') then raise exception 'concepto previsto: este tipo no se convierte en coste operativo real'; end if;
  v_cost_type := public.dmp_quote_line_cost_type(v_line.line_type);
  if v_cost_type is null then raise exception 'concepto previsto: tipo no operativo'; end if;

  v_quantity := coalesce(v_quantity, v_line.quantity, 1);
  v_unit := coalesce(v_unit, v_line.unit, 'ud');
  v_unit_cost := coalesce(v_unit_cost, v_line.unit_cost, 0);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if v_unit_cost < 0 then raise exception 'validacion del formulario: el coste unitario no puede ser negativo'; end if;
  if v_unit_cost > 0 and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permisos para registrar importes economicos'; end if;

  if v_decision = 'confirmado' then
    select id into v_cost_entry_id
    from public.work_order_cost_entries
    where company_id = v_work.company_id and work_order_id = v_work.id and quote_line_id = v_line.id and deleted_at is null
    for update;

    if v_cost_entry_id is null then
      insert into public.work_order_cost_entries(company_id, work_order_id, quote_line_id, cost_type, description, quantity, unit, unit_cost, incurred_at, registered_by, updated_by, local_change_id)
      values (v_work.company_id, v_work.id, v_line.id, v_cost_type, v_line.description, v_quantity, v_unit, case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else 0 end, current_date, v_profile.id, v_profile.id, 'quote-line:' || v_line.id::text)
      on conflict (company_id, work_order_id, quote_line_id) where quote_line_id is not null and deleted_at is null do update
        set cost_type = excluded.cost_type,
            description = excluded.description,
            quantity = excluded.quantity,
            unit = excluded.unit,
            unit_cost = excluded.unit_cost,
            updated_at = now(),
            updated_by = excluded.updated_by,
            local_change_id = excluded.local_change_id
      returning id into v_cost_entry_id;
    else
      update public.work_order_cost_entries
      set cost_type = v_cost_type,
          description = v_line.description,
          quantity = v_quantity,
          unit = v_unit,
          unit_cost = case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else unit_cost end,
          updated_at = now(),
          updated_by = v_profile.id,
          local_change_id = coalesce(local_change_id, 'quote-line:' || v_line.id::text)
      where id = v_cost_entry_id;
    end if;
  else
    update public.work_order_cost_entries
    set deleted_at = now(), deleted_by = v_profile.id, delete_reason = coalesce(v_notes, 'Concepto previsto marcado como no realizado'), updated_at = now(), updated_by = v_profile.id
    where company_id = v_work.company_id and work_order_id = v_work.id and quote_line_id = v_line.id and deleted_at is null;
    v_cost_entry_id := null;
  end if;

  insert into public.work_order_quote_line_decisions(company_id, work_order_id, quote_line_id, decision, work_order_cost_entry_id, real_quantity, real_unit, real_unit_cost, notes, decided_by, decided_at, updated_at, deleted_at)
  values (v_work.company_id, v_work.id, v_line.id, v_decision, v_cost_entry_id, case when v_decision = 'confirmado' then v_quantity else null end, case when v_decision = 'confirmado' then v_unit else null end, case when v_decision = 'confirmado' then v_unit_cost else null end, v_notes, v_profile.id, now(), now(), null)
  on conflict (company_id, work_order_id, quote_line_id) do update
    set decision = excluded.decision,
        work_order_cost_entry_id = excluded.work_order_cost_entry_id,
        real_quantity = excluded.real_quantity,
        real_unit = excluded.real_unit,
        real_unit_cost = excluded.real_unit_cost,
        notes = excluded.notes,
        decided_by = excluded.decided_by,
        decided_at = now(),
        updated_at = now(),
        deleted_at = null
  returning id into v_decision_id;

  return coalesce(v_cost_entry_id, v_decision_id);
end;
$$;

revoke all on table public.work_order_quote_line_decisions from public, anon;
grant select on table public.work_order_quote_line_decisions to authenticated;
revoke all on function public.dmp_quote_line_cost_type(text) from public;
grant execute on function public.dmp_quote_line_cost_type(text) to authenticated;
revoke all on function public.dmp_set_work_order_quote_line_decision(jsonb) from public;
revoke all on function public.dmp_set_work_order_quote_line_decision(jsonb) from anon;
grant execute on function public.dmp_set_work_order_quote_line_decision(jsonb) to authenticated;

commit;
