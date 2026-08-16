-- DoorManager Pro - superadmin sin restricciones funcionales indebidas.
-- Mantiene RLS activo: superadmin puede operar cualquier empresa, y el frontend
-- debe enviar siempre el company_id de la empresa seleccionada.

begin;

drop policy if exists quotes_platform_superadmin_select on public.quotes;
drop policy if exists quotes_platform_superadmin_insert on public.quotes;
drop policy if exists quotes_platform_superadmin_update on public.quotes;
create policy quotes_platform_superadmin_select on public.quotes for select to authenticated
  using (public.is_platform_superadmin());
create policy quotes_platform_superadmin_insert on public.quotes for insert to authenticated
  with check (public.is_platform_superadmin());
create policy quotes_platform_superadmin_update on public.quotes for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

drop policy if exists quote_lines_platform_superadmin_select on public.quote_lines;
drop policy if exists quote_lines_platform_superadmin_insert on public.quote_lines;
drop policy if exists quote_lines_platform_superadmin_update on public.quote_lines;
create policy quote_lines_platform_superadmin_select on public.quote_lines for select to authenticated
  using (public.is_platform_superadmin());
create policy quote_lines_platform_superadmin_insert on public.quote_lines for insert to authenticated
  with check (public.is_platform_superadmin());
create policy quote_lines_platform_superadmin_update on public.quote_lines for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

drop policy if exists technician_hour_rates_platform_superadmin_select on public.technician_hour_rates;
drop policy if exists technician_hour_rates_platform_superadmin_insert on public.technician_hour_rates;
drop policy if exists technician_hour_rates_platform_superadmin_update on public.technician_hour_rates;
create policy technician_hour_rates_platform_superadmin_select on public.technician_hour_rates for select to authenticated
  using (public.is_platform_superadmin());
create policy technician_hour_rates_platform_superadmin_insert on public.technician_hour_rates for insert to authenticated
  with check (public.is_platform_superadmin());
create policy technician_hour_rates_platform_superadmin_update on public.technician_hour_rates for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

alter table public.work_orders add column if not exists quote_id uuid references public.quotes(id);
create index if not exists work_orders_quote_id_idx on public.work_orders(company_id, quote_id) where quote_id is not null;

create or replace function public.create_work_order_full(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_created_by uuid := (p_payload->>'created_by')::uuid;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_site_id uuid := (p_payload->>'site_id')::uuid;
  v_equipment_id uuid := nullif(p_payload->>'main_equipment_id', '')::uuid;
  v_technician_id uuid := nullif(p_payload->>'technician_id', '')::uuid;
  v_quote_id uuid := nullif(p_payload->>'quote_id', '')::uuid;
  v_id uuid;
  v_code text;
begin
  perform public.assert_member_of_current_company(v_company_id);
  if v_created_by <> public.current_profile_id() then raise exception 'Creador no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then raise exception 'No tienes permisos para crear partes'; end if;
  if not exists (select 1 from public.clients where id = v_client_id and company_id = v_company_id and deleted_at is null) then raise exception 'Cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = v_site_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'Centro no valido'; end if;
  if v_equipment_id is not null and not exists (select 1 from public.equipment where id = v_equipment_id and company_id = v_company_id and client_id = v_client_id and site_id = v_site_id and deleted_at is null) then raise exception 'Equipo no valido'; end if;
  if v_quote_id is not null and not exists (select 1 from public.quotes where id = v_quote_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'Presupuesto no valido'; end if;

  v_code := public.next_dmp_code(v_company_id, 'work_orders', 'PAR', true, 6);
  insert into public.work_orders(company_id, code, case_id, quote_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, scheduled_date, scheduled_time, estimated_duration_minutes, contact_id, access_requirement_id, planned_material, created_by, created_role, updated_by, current_responsible_id)
  values (v_company_id, v_code, nullif(p_payload->>'case_id', '')::uuid, v_quote_id, v_client_id, v_site_id, v_equipment_id, p_payload->>'title', nullif(p_payload->>'description', ''), p_payload->>'type', coalesce(nullif(p_payload->>'priority', ''), 'Normal'), p_payload->>'origin', nullif(p_payload->>'scheduled_date', '')::date, nullif(p_payload->>'scheduled_time', '')::time, nullif(p_payload->>'estimated_duration_minutes', '')::integer, nullif(p_payload->>'contact_id', '')::uuid, nullif(p_payload->>'access_requirement_id', '')::uuid, nullif(p_payload->>'planned_material', ''), v_created_by, p_payload->>'created_role', v_created_by, coalesce(v_technician_id, v_created_by))
  returning id into v_id;

  if v_technician_id is not null then
    perform public.assign_technician(v_id, v_technician_id, coalesce(nullif(p_payload->>'scheduled_date', '')::date, current_date), nullif(p_payload->>'scheduled_time', '')::time, null, 'Principal', v_created_by);
  end if;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (v_company_id, v_id, null, 'Pendiente', v_created_by, 'Creacion transaccional de parte ' || v_code);
  return v_id;
end;
$$;

grant execute on function public.create_work_order_full(jsonb) to authenticated;

commit;
