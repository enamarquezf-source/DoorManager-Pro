-- A check or a secondary work-order equipment link must expose its equipment
-- to the assigned technician, using the same scope as equipment photos.
begin;
drop policy if exists equipment_select_technician_linked on public.equipment;
create policy equipment_select_technician_linked on public.equipment
for select to authenticated using (
  company_id=public.current_company_id() and deleted_at is null
  and public.has_any_role(array['Tecnico'])
  and public.can_read_equipment_photo(id)
);
commit;
