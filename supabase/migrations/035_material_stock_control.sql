-- Stock real de materiales: cantidades, movimientos y consumo desde partes.

alter table public.materials add column if not exists stock_quantity numeric(12,2) not null default 0 check (stock_quantity >= 0);
alter table public.materials add column if not exists stock_controlled boolean not null default true;
alter table public.materials add column if not exists allow_negative_stock boolean not null default false;
alter table public.materials add column if not exists last_stock_movement_at timestamptz;

alter table public.work_order_materials add column if not exists stock_deducted_quantity numeric(12,2) not null default 0;
alter table public.work_order_materials add column if not exists deleted_at timestamptz;

create table if not exists public.material_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  material_id uuid not null references public.materials(id),
  work_order_id uuid references public.work_orders(id),
  work_order_material_id uuid references public.work_order_materials(id),
  quote_id uuid references public.quotes(id),
  movement_type text not null check (movement_type in ('initial','in','out','adjustment','return','correction')),
  quantity numeric(12,2) not null check (quantity > 0),
  previous_stock numeric(12,2) not null,
  new_stock numeric(12,2) not null,
  unit_cost numeric(12,2),
  reason text,
  source text check (source in ('manual','work_order','quote','correction')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists material_stock_movements_company_material_idx on public.material_stock_movements(company_id, material_id, created_at desc);
create index if not exists material_stock_movements_work_order_idx on public.material_stock_movements(company_id, work_order_id) where work_order_id is not null;

alter table public.material_stock_movements enable row level security;

drop policy if exists material_stock_movements_select_scoped on public.material_stock_movements;
drop policy if exists material_stock_movements_insert_block_direct on public.material_stock_movements;
drop policy if exists material_stock_movements_update_block_direct on public.material_stock_movements;
drop policy if exists material_stock_movements_delete_block_direct on public.material_stock_movements;
drop policy if exists material_stock_movements_platform_superadmin_select on public.material_stock_movements;
create policy material_stock_movements_select_scoped on public.material_stock_movements for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']));
create policy material_stock_movements_insert_block_direct on public.material_stock_movements for insert to authenticated with check (false);
create policy material_stock_movements_update_block_direct on public.material_stock_movements for update to authenticated using (false) with check (false);
create policy material_stock_movements_delete_block_direct on public.material_stock_movements for delete to authenticated using (false);
create policy material_stock_movements_platform_superadmin_select on public.material_stock_movements for select to authenticated using (public.is_platform_superadmin());

drop policy if exists materials_update_stock_backoffice on public.materials;
create policy materials_update_stock_backoffice on public.materials for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

create or replace function public.dmp_apply_material_stock_movement(
  p_material_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_source text default 'manual',
  p_work_order_id uuid default null,
  p_work_order_material_id uuid default null,
  p_quote_id uuid default null,
  p_unit_cost numeric default null,
  p_created_by uuid default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material public.materials;
  v_previous numeric;
  v_new numeric;
  v_delta numeric;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if p_movement_type not in ('initial','in','out','adjustment','return','correction') then raise exception 'validacion del formulario: tipo de movimiento de stock no valido'; end if;
  select * into v_material from public.materials where id = p_material_id and deleted_at is null for update;
  if v_material.id is null then raise exception 'material: material no encontrado'; end if;
  if not v_material.stock_controlled then return v_material.stock_quantity; end if;
  v_previous := coalesce(v_material.stock_quantity, 0);
  if p_movement_type in ('in','initial','return') then
    v_delta := p_quantity;
  elsif p_movement_type = 'out' then
    v_delta := -p_quantity;
  else
    v_delta := p_quantity - v_previous;
  end if;
  v_new := v_previous + v_delta;
  if v_new < 0 and not v_material.allow_negative_stock then raise exception 'stock: stock insuficiente para %', v_material.code; end if;
  update public.materials set stock_quantity = v_new, last_stock_movement_at = now(), updated_at = now() where id = v_material.id;
  insert into public.material_stock_movements(company_id, material_id, work_order_id, work_order_material_id, quote_id, movement_type, quantity, previous_stock, new_stock, unit_cost, reason, source, created_by)
  values (v_material.company_id, v_material.id, p_work_order_id, p_work_order_material_id, p_quote_id, p_movement_type, p_quantity, v_previous, v_new, p_unit_cost, nullif(p_reason, ''), p_source, p_created_by);
  return v_new;
end;
$$;

create or replace function public.dmp_adjust_material_stock(p_material_id uuid, p_movement_type text, p_quantity numeric, p_reason text, p_unit_cost numeric default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_material public.materials;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  if p_movement_type not in ('initial','in','out','adjustment','return','correction') then raise exception 'validacion del formulario: tipo de movimiento de stock no valido'; end if;
  select * into v_material from public.materials where id = p_material_id and deleted_at is null;
  if v_material.id is null then raise exception 'material: material no encontrado'; end if;
  perform public.assert_member_of_current_company(v_material.company_id);
  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes permiso para ajustar stock'; end if;
  return public.dmp_apply_material_stock_movement(p_material_id, p_movement_type, p_quantity, p_reason, 'manual', null, null, null, p_unit_cost, v_profile.id);
end;
$$;

create or replace function public.dmp_upsert_work_order_material(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_local text := nullif(p_payload->>'local_change_id', '');
  v_material uuid := nullif(p_payload->>'material_id', '')::uuid;
  v_material_row public.materials;
  v_quantity numeric := coalesce(nullif(p_payload->>'quantity', '')::numeric, nullif(p_payload->>'used_quantity', '')::numeric, 1);
  v_previous public.work_order_materials;
  v_unit_price numeric := 0;
  v_stock_deducted numeric := 0;
begin
  if nullif(p_payload->>'work_order_id', '') is null then raise exception 'validacion del formulario: falta work_order_id'; end if;
  v_work := public.dmp024_assert_work_order_operator((p_payload->>'work_order_id')::uuid, false);
  if v_quantity <= 0 then raise exception 'validacion del formulario: la cantidad debe ser mayor que cero'; end if;
  if trim(coalesce(p_payload->>'unit', 'ud')) = '' then raise exception 'validacion del formulario: indica una unidad'; end if;
  if v_material is not null then
    select * into v_material_row from public.materials where id = v_material and deleted_at is null for update;
    if v_material_row.id is null or (v_material_row.company_id is not null and v_material_row.company_id <> v_work.company_id) then raise exception 'empresa: material no valido para la empresa del parte'; end if;
  end if;
  if v_material is null and trim(coalesce(p_payload->>'description', '')) = '' then raise exception 'validacion del formulario: indica material de catalogo o descripcion no catalogada'; end if;
  if v_local is not null then
    if exists (select 1 from public.work_order_materials where company_id = v_work.company_id and local_change_id = v_local and work_order_id <> v_work.id) then raise exception 'insercion: el identificador local ya pertenece a otro parte'; end if;
    select id into v_id from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local and deleted_at is null;
  end if;
  if v_id is not null then
    select * into v_previous from public.work_order_materials where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id and deleted_at is null for update;
    if v_previous.id is null or not (v_previous.registered_by = v_profile.id or public.has_any_role(array['superadmin','SAT','Gerencia'])) then raise exception 'permiso: material no editable para este usuario'; end if;
    if v_previous.material_id is not null and v_previous.stock_deducted_quantity > 0 then
      perform public.dmp_apply_material_stock_movement(v_previous.material_id, 'return', v_previous.stock_deducted_quantity, 'Correccion de material de parte', 'correction', v_work.id, v_previous.id, null, v_previous.unit_price, v_profile.id);
    end if;
    v_unit_price := case when public.has_any_role(array['superadmin','SAT','Gerencia']) then coalesce(nullif(p_payload->>'unit_price', '')::numeric, v_previous.unit_price, v_material_row.price, 0) else v_previous.unit_price end;
    if v_material is not null and coalesce(v_material_row.stock_controlled, true) then
      perform public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity, 'Consumo en parte ' || v_work.code, 'work_order', v_work.id, v_id, null, coalesce(v_material_row.cost, v_unit_price), v_profile.id);
      v_stock_deducted := v_quantity;
    end if;
    update public.work_order_materials set material_id = v_material, description = nullif(p_payload->>'description', ''), used_quantity = v_quantity, unit = coalesce(nullif(p_payload->>'unit', ''), unit, v_material_row.unit, 'ud'), unit_price = v_unit_price, notes = nullif(p_payload->>'notes', ''), registered_by = coalesce(registered_by, v_profile.id), used_at = coalesce(nullif(p_payload->>'used_at', '')::date, used_at, current_date), stock_deducted_quantity = v_stock_deducted, updated_at = now() where id = v_id;
    return v_id;
  end if;
  v_unit_price := case when public.has_any_role(array['superadmin','SAT','Gerencia']) then coalesce(nullif(p_payload->>'unit_price', '')::numeric, v_material_row.price, 0) else 0 end;
  insert into public.work_order_materials(company_id, work_order_id, material_id, description, planned_quantity, used_quantity, unit, unit_price, notes, registered_by, used_at, local_change_id, stock_deducted_quantity)
  values (v_work.company_id, v_work.id, v_material, nullif(p_payload->>'description', ''), 0, v_quantity, coalesce(nullif(p_payload->>'unit', ''), v_material_row.unit, 'ud'), v_unit_price, nullif(p_payload->>'notes', ''), v_profile.id, coalesce(nullif(p_payload->>'used_at', '')::date, current_date), v_local, 0)
  returning id into v_id;
  if v_material is not null and coalesce(v_material_row.stock_controlled, true) then
    perform public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity, 'Consumo en parte ' || v_work.code, 'work_order', v_work.id, v_id, null, coalesce(v_material_row.cost, v_unit_price), v_profile.id);
    update public.work_order_materials set stock_deducted_quantity = v_quantity where id = v_id;
  end if;
  return v_id;
exception when others then
  raise exception 'respuesta de Supabase: %', sqlerrm;
end;
$$;

create or replace function public.dmp_delete_work_order_material(p_material_usage_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles := public.dmp024_active_profile();
  v_usage public.work_order_materials;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'validacion del formulario: el motivo es obligatorio'; end if;
  select * into v_usage from public.work_order_materials where id = p_material_usage_id and deleted_at is null for update;
  if v_usage.id is null then raise exception 'material: material no encontrado'; end if;
  perform public.dmp024_assert_work_order_operator(v_usage.work_order_id, coalesce(v_usage.registered_by, v_profile.id) <> v_profile.id);
  if coalesce(v_usage.registered_by, v_profile.id) <> v_profile.id and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes permisos para eliminar materiales de otros trabajadores'; end if;
  if v_usage.material_id is not null and v_usage.stock_deducted_quantity > 0 then
    perform public.dmp_apply_material_stock_movement(v_usage.material_id, 'return', v_usage.stock_deducted_quantity, p_reason, 'work_order', v_usage.work_order_id, v_usage.id, null, v_usage.unit_price, v_profile.id);
  end if;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_usage.company_id, 'work_order_materials', v_usage.id, 'DELETE', v_profile.id, to_jsonb(v_usage), jsonb_build_object('reason', p_reason));
  update public.work_order_materials set deleted_at = now(), stock_deducted_quantity = 0, updated_at = now() where id = p_material_usage_id;
end;
$$;

revoke all on function public.dmp_apply_material_stock_movement(uuid, text, numeric, text, text, uuid, uuid, uuid, numeric, uuid) from public;
revoke all on function public.dmp_adjust_material_stock(uuid, text, numeric, text, numeric) from public;
grant execute on function public.dmp_adjust_material_stock(uuid, text, numeric, text, numeric) to authenticated;
