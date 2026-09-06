-- DoorManager Pro - restaura el alcance global del propietario sobre equipment_types.
-- 113 reemplazo las policies heredadas de 017; esta correccion no toca datos ni FKs.

begin;

drop policy if exists equipment_types_platform_superadmin_select on public.equipment_types;
drop policy if exists equipment_types_platform_superadmin_insert on public.equipment_types;
drop policy if exists equipment_types_platform_superadmin_update on public.equipment_types;

create policy equipment_types_platform_superadmin_select on public.equipment_types
  for select to authenticated
  using (public.is_platform_superadmin());

create policy equipment_types_platform_superadmin_insert on public.equipment_types
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy equipment_types_platform_superadmin_update on public.equipment_types
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

commit;
