-- DoorManager Pro - harden supplier grants and complete platform scope.
begin;

-- RLS does not protect TRUNCATE and these catalog tables are never hard-deleted.
revoke all privileges on public.suppliers from anon;
revoke all privileges on public.material_suppliers from anon;
revoke delete, truncate, references, trigger on public.suppliers from authenticated;
revoke delete, truncate, references, trigger on public.material_suppliers from authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.material_suppliers to authenticated;

drop policy if exists material_suppliers_platform_superadmin_select on public.material_suppliers;
drop policy if exists material_suppliers_platform_superadmin_insert on public.material_suppliers;
drop policy if exists material_suppliers_platform_superadmin_update on public.material_suppliers;
create policy material_suppliers_platform_superadmin_select on public.material_suppliers
  for select to authenticated using (public.is_platform_superadmin());
create policy material_suppliers_platform_superadmin_insert on public.material_suppliers
  for insert to authenticated with check (public.is_platform_superadmin());
create policy material_suppliers_platform_superadmin_update on public.material_suppliers
  for update to authenticated using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

commit;
