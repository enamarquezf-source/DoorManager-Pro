-- DoorManager Pro - gestion segura de tipos de equipo por empresa.
-- Los tipos no se borran fisicamente: active=false conserva sus FKs e historicos.

begin;

drop policy if exists equipment_types_company_policy on public.equipment_types;
drop policy if exists equipment_types_platform_superadmin_select on public.equipment_types;
drop policy if exists equipment_types_platform_superadmin_insert on public.equipment_types;
drop policy if exists equipment_types_platform_superadmin_update on public.equipment_types;
drop policy if exists equipment_types_select_scoped on public.equipment_types;
drop policy if exists equipment_types_insert_admin on public.equipment_types;
drop policy if exists equipment_types_update_admin on public.equipment_types;

create policy equipment_types_select_scoped on public.equipment_types
  for select to authenticated
  using (
    (company_id = public.current_company_id() or company_id is null)
    and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina','Tecnico'])
  );

create policy equipment_types_insert_admin on public.equipment_types
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT'])
  );

create policy equipment_types_update_admin on public.equipment_types
  for update to authenticated
  using (
    (company_id = public.current_company_id() or public.is_platform_superadmin())
    and public.has_any_role(array['superadmin','SAT'])
  )
  with check (
    (company_id = public.current_company_id() or (public.is_platform_superadmin() and company_id is null))
    and public.has_any_role(array['superadmin','SAT'])
  );

commit;
