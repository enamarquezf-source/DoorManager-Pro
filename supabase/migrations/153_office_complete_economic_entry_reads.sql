-- Office must see every concept that the economic approval RPC requires.
-- Only SELECT, in the active company; direct writes remain unchanged.
begin;
drop policy if exists work_order_time_entries_office_economic_select on public.work_order_time_entries;
create policy work_order_time_entries_office_economic_select on public.work_order_time_entries
for select to authenticated using (
  company_id=public.current_company_id() and public.has_any_role(array['Oficina'])
  and exists(select 1 from public.work_orders review_work where review_work.id=work_order_time_entries.work_order_id and review_work.company_id=work_order_time_entries.company_id and review_work.deleted_at is null)
);
drop policy if exists work_order_materials_office_economic_select on public.work_order_materials;
create policy work_order_materials_office_economic_select on public.work_order_materials
for select to authenticated using (
  company_id=public.current_company_id() and public.has_any_role(array['Oficina'])
  and exists(select 1 from public.work_orders review_work where review_work.id=work_order_materials.work_order_id and review_work.company_id=work_order_materials.company_id and review_work.deleted_at is null)
);
drop policy if exists work_order_cost_entries_office_economic_select on public.work_order_cost_entries;
create policy work_order_cost_entries_office_economic_select on public.work_order_cost_entries
for select to authenticated using (
  company_id=public.current_company_id() and public.has_any_role(array['Oficina'])
  and exists(select 1 from public.work_orders review_work where review_work.id=work_order_cost_entries.work_order_id and review_work.company_id=work_order_cost_entries.company_id and review_work.deleted_at is null)
);
commit;
