-- DoorManager Pro - correccion segura para generar partes desde presupuestos.
-- Idempotente. Mantiene RLS activo y no consume stock.

begin;

alter table public.work_orders add column if not exists quote_id uuid references public.quotes(id);
create index if not exists work_orders_quote_id_idx on public.work_orders(company_id, quote_id) where quote_id is not null;

drop policy if exists work_orders_platform_superadmin_select on public.work_orders;
drop policy if exists work_orders_platform_superadmin_insert on public.work_orders;
drop policy if exists work_orders_platform_superadmin_update on public.work_orders;
create policy work_orders_platform_superadmin_select on public.work_orders for select to authenticated
  using (public.is_platform_superadmin());
create policy work_orders_platform_superadmin_insert on public.work_orders for insert to authenticated
  with check (public.is_platform_superadmin());
create policy work_orders_platform_superadmin_update on public.work_orders for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

drop policy if exists work_orders_insert_quote_authorized_roles on public.work_orders;
create policy work_orders_insert_quote_authorized_roles on public.work_orders for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']));

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
  v_site_id uuid := nullif(p_payload->>'site_id', '')::uuid;
  v_equipment_id uuid := nullif(p_payload->>'main_equipment_id', '')::uuid;
  v_technician_id uuid := nullif(p_payload->>'technician_id', '')::uuid;
  v_quote_id uuid := nullif(p_payload->>'quote_id', '')::uuid;
  v_case_id uuid := nullif(p_payload->>'case_id', '')::uuid;
  v_quote public.quotes;
  v_id uuid;
  v_code text;
begin
  if v_company_id is null then raise exception 'validacion del formulario: presupuesto sin empresa'; end if;
  if v_client_id is null then raise exception 'validacion del formulario: presupuesto sin cliente'; end if;
  if v_site_id is null then raise exception 'validacion del formulario: presupuesto sin centro para crear parte'; end if;
  if not public.is_platform_superadmin() then perform public.assert_member_of_current_company(v_company_id); end if;
  if v_created_by is null or v_created_by <> public.current_profile_id() then raise exception 'Creador no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']) then raise exception 'No tienes permisos para crear partes'; end if;
  if not exists (select 1 from public.clients where id = v_client_id and company_id = v_company_id and deleted_at is null) then raise exception 'Cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = v_site_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'Centro no valido'; end if;
  if v_equipment_id is not null and not exists (select 1 from public.equipment where id = v_equipment_id and company_id = v_company_id and client_id = v_client_id and site_id = v_site_id and deleted_at is null) then raise exception 'Equipo no valido'; end if;
  if v_case_id is not null and not exists (select 1 from public.cases where id = v_case_id and company_id = v_company_id and client_id = v_client_id and (site_id is null or site_id = v_site_id) and deleted_at is null) then raise exception 'Expediente no valido'; end if;
  if v_quote_id is not null then
    select * into v_quote from public.quotes where id = v_quote_id and deleted_at is null;
    if v_quote.id is null then raise exception 'Presupuesto no valido'; end if;
    if v_quote.company_id <> v_company_id or v_quote.client_id <> v_client_id then raise exception 'Presupuesto no pertenece a la empresa o cliente del parte'; end if;
    if v_quote.site_id is not null and v_quote.site_id is distinct from v_site_id then raise exception 'Centro no coincide con el presupuesto'; end if;
    if v_quote.equipment_id is not null and v_quote.equipment_id is distinct from v_equipment_id then raise exception 'Equipo no coincide con el presupuesto'; end if;
    if v_quote.case_id is not null and v_quote.case_id is distinct from v_case_id then raise exception 'Expediente no coincide con el presupuesto'; end if;
    if lower(coalesce(v_quote.status, '')) not in ('aceptado','ejecutado en cliente') then raise exception 'validacion del formulario: presupuesto no aceptado para generar parte'; end if;
  end if;

  v_code := public.next_dmp_code(v_company_id, 'work_orders', 'PAR', true, 6);
  insert into public.work_orders(company_id, code, case_id, quote_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, scheduled_date, scheduled_time, estimated_duration_minutes, contact_id, access_requirement_id, planned_material, created_by, created_role, updated_by, current_responsible_id)
  values (v_company_id, v_code, v_case_id, v_quote_id, v_client_id, v_site_id, v_equipment_id, coalesce(nullif(p_payload->>'title', ''), 'Parte generado desde presupuesto'), nullif(p_payload->>'description', ''), coalesce(nullif(p_payload->>'type', ''), 'Correctivo'), coalesce(nullif(p_payload->>'priority', ''), 'Normal'), coalesce(nullif(p_payload->>'origin', ''), 'Comercial'), nullif(p_payload->>'scheduled_date', '')::date, nullif(p_payload->>'scheduled_time', '')::time, nullif(p_payload->>'estimated_duration_minutes', '')::integer, nullif(p_payload->>'contact_id', '')::uuid, nullif(p_payload->>'access_requirement_id', '')::uuid, nullif(p_payload->>'planned_material', ''), v_created_by, p_payload->>'created_role', v_created_by, coalesce(v_technician_id, v_created_by))
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
