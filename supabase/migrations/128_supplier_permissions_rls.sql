-- DoorManager Pro - align supplier catalog RLS with canonical permissions.
begin;

drop policy if exists suppliers_select_backoffice on public.suppliers;
drop policy if exists suppliers_insert_backoffice on public.suppliers;
drop policy if exists suppliers_update_backoffice on public.suppliers;
drop policy if exists material_suppliers_select_backoffice on public.material_suppliers;
drop policy if exists material_suppliers_insert_backoffice on public.material_suppliers;
drop policy if exists material_suppliers_update_backoffice on public.material_suppliers;
drop policy if exists suppliers_platform_superadmin_select on public.suppliers;
drop policy if exists suppliers_platform_superadmin_insert on public.suppliers;
drop policy if exists suppliers_platform_superadmin_update on public.suppliers;
drop policy if exists material_suppliers_platform_superadmin_select on public.material_suppliers;
drop policy if exists material_suppliers_platform_superadmin_insert on public.material_suppliers;
drop policy if exists material_suppliers_platform_superadmin_update on public.material_suppliers;

create policy suppliers_select_permissions on public.suppliers
  for select to authenticated
  using (((company_id = public.current_company_id()
    and public.has_permission('suppliers.read'))
    or public.is_platform_superadmin())
    and deleted_at is null);
create policy suppliers_insert_permissions on public.suppliers
  for insert to authenticated
  with check ((company_id = public.current_company_id()
    and public.has_permission('suppliers.create'))
    or public.is_platform_superadmin());
create policy suppliers_update_permissions on public.suppliers
  for update to authenticated
  using ((company_id = public.current_company_id()
    and public.has_permission('suppliers.update'))
    or public.is_platform_superadmin())
  with check ((company_id = public.current_company_id()
    and public.has_permission('suppliers.update'))
    or public.is_platform_superadmin());

create policy material_suppliers_select_permissions on public.material_suppliers
  for select to authenticated
  using ((company_id = public.current_company_id()
    and public.has_permission('suppliers.read'))
    or public.is_platform_superadmin());
create policy material_suppliers_insert_permissions on public.material_suppliers
  for insert to authenticated
  with check ((company_id = public.current_company_id()
    and public.has_permission('suppliers.update'))
    or public.is_platform_superadmin());
create policy material_suppliers_update_permissions on public.material_suppliers
  for update to authenticated
  using ((company_id = public.current_company_id()
    and public.has_permission('suppliers.update'))
    or public.is_platform_superadmin())
  with check ((company_id = public.current_company_id()
    and public.has_permission('suppliers.update'))
    or public.is_platform_superadmin());

commit;
