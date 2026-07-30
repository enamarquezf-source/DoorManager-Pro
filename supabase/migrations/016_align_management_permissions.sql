-- DoorManager Pro - alinea permisos de Gerencia con la matriz funcional documentada.
-- Gerencia mantiene vision global, partes y asignacion; no crea/edita clientes ni checks.

drop policy if exists clients_insert_business on public.clients;
drop policy if exists clients_update_business on public.clients;
create policy clients_insert_business on public.clients for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial']));
create policy clients_update_business on public.clients for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Oficina']))
  with check (company_id = public.current_company_id());

drop policy if exists checks_insert_operational on public.checks;
drop policy if exists checks_update_assigned_or_admin on public.checks;
create policy checks_insert_operational on public.checks for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT']));
create policy checks_update_assigned_or_admin on public.checks for update to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT']) or technician_id = public.current_profile_id() or public.is_assigned_to_work_order(work_order_id)))
  with check (company_id = public.current_company_id());
