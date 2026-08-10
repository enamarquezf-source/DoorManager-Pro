-- DoorManager Pro - recursos y costes auxiliares de partes.
-- Idempotente. Mantiene RLS, operaciones por RPC y sin permisos para anon/public.

begin;

create table if not exists public.work_order_cost_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  cost_type text not null check (cost_type in ('desplazamiento','taller_movil','plataforma_elevadora','medio_auxiliar','coste_externo','parking_peaje','dieta','otro')),
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default 'ud',
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  incurred_at date not null default current_date,
  registered_by uuid not null references public.profiles(id),
  local_change_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_order_cost_entries_work_order_idx on public.work_order_cost_entries(work_order_id, incurred_at);
create index if not exists work_order_cost_entries_registered_by_idx on public.work_order_cost_entries(registered_by, incurred_at);
create unique index if not exists work_order_cost_entries_work_order_local_change_unique on public.work_order_cost_entries(company_id, work_order_id, local_change_id) where local_change_id is not null;

alter table public.work_order_cost_entries enable row level security;

drop policy if exists work_order_cost_entries_select_scoped on public.work_order_cost_entries;
create policy work_order_cost_entries_select_scoped on public.work_order_cost_entries for select to authenticated
  using (
    (company_id = public.current_company_id()
      and (
        public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial'])
        or registered_by = public.current_profile_id()
        or public.is_assigned_to_work_order(work_order_id, public.current_profile_id())
      ))
    or public.is_platform_superadmin()
  );

drop policy if exists work_order_cost_entries_insert_block_direct on public.work_order_cost_entries;
create policy work_order_cost_entries_insert_block_direct on public.work_order_cost_entries for insert to authenticated with check (false);
drop policy if exists work_order_cost_entries_update_block_direct on public.work_order_cost_entries;
create policy work_order_cost_entries_update_block_direct on public.work_order_cost_entries for update to authenticated using (false) with check (false);
drop policy if exists work_order_cost_entries_delete_block_direct on public.work_order_cost_entries;
create policy work_order_cost_entries_delete_block_direct on public.work_order_cost_entries for delete to authenticated using (false);

create or replace function public.dmp_upsert_work_order_cost_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_cost_type text := coalesce(nullif(p_payload->>'cost_type', ''), 'otro');
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, 1);
  v_unit_cost numeric := coalesce(nullif(p_payload->>'unit_cost', '')::numeric, 0);
begin
  v_work := public.dmp_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_cost_type not in ('desplazamiento','taller_movil','plataforma_elevadora','medio_auxiliar','coste_externo','parking_peaje','dieta','otro') then raise exception 'Tipo de recurso o coste no valido'; end if;
  if trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'La descripcion del recurso o coste es obligatoria'; end if;
  if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if v_unit_cost < 0 then raise exception 'El coste unitario no puede ser negativo'; end if;
  if v_unit_cost > 0 and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'No tienes permisos para registrar importes economicos'; end if;
  if v_local is not null then
    if exists (select 1 from public.work_order_cost_entries where company_id = v_work.company_id and local_change_id = v_local and work_order_id <> v_work.id) then raise exception 'El identificador local ya pertenece a otro parte'; end if;
    select id into v_id from public.work_order_cost_entries where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local;
  end if;
  if v_id is not null then
    if not exists (select 1 from public.work_order_cost_entries where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and (registered_by = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))) then raise exception 'Recurso o coste no editable'; end if;
    update public.work_order_cost_entries set cost_type = v_cost_type, description = trim(p_payload->>'description'), quantity = v_quantity, unit = coalesce(nullif(p_payload->>'unit', ''), unit, 'ud'), unit_cost = case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else unit_cost end, incurred_at = coalesce(nullif(p_payload->>'incurred_at', '')::date, incurred_at, current_date), updated_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.work_order_cost_entries(company_id, work_order_id, cost_type, description, quantity, unit, unit_cost, incurred_at, registered_by, local_change_id)
  values (v_work.company_id, v_work.id, v_cost_type, trim(p_payload->>'description'), v_quantity, coalesce(nullif(p_payload->>'unit', ''), 'ud'), case when public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then v_unit_cost else 0 end, coalesce(nullif(p_payload->>'incurred_at', '')::date, current_date), v_profile.id, v_local)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_delete_work_order_cost_entry(p_cost_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp_active_profile();
  v_entry public.work_order_cost_entries;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into v_entry from public.work_order_cost_entries where id = p_cost_entry_id for update;
  if v_entry.id is null then raise exception 'Recurso o coste no encontrado'; end if;
  perform public.dmp_assert_work_order_operator(v_entry.work_order_id, v_entry.registered_by <> v_profile.id);
  if v_entry.registered_by <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'No tienes permisos para eliminar recursos o costes de otros usuarios'; end if;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_entry.company_id, 'work_order_cost_entries', v_entry.id, 'DELETE', v_profile.id, to_jsonb(v_entry), jsonb_build_object('reason', p_reason));
  delete from public.work_order_cost_entries where id = p_cost_entry_id;
end;
$$;

revoke all on table public.work_order_cost_entries from public, anon;
grant select on table public.work_order_cost_entries to authenticated;
revoke all on function public.dmp_upsert_work_order_cost_entry(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_cost_entry(jsonb) from anon;
grant execute on function public.dmp_upsert_work_order_cost_entry(jsonb) to authenticated;
revoke all on function public.dmp_delete_work_order_cost_entry(uuid, text) from public;
revoke all on function public.dmp_delete_work_order_cost_entry(uuid, text) from anon;
grant execute on function public.dmp_delete_work_order_cost_entry(uuid, text) to authenticated;

commit;
