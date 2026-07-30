-- DoorManager Pro - cierre de policies genericas restantes en tablas criticas

drop policy if exists check_templates_company_policy on public.check_templates;
drop policy if exists check_photos_company_policy on public.check_photos;
drop policy if exists cases_company_policy on public.cases;
drop policy if exists case_events_company_policy on public.case_events;
drop policy if exists case_links_company_policy on public.case_links;
drop policy if exists case_documents_company_policy on public.case_documents;
drop policy if exists alerts_company_policy on public.alerts;
drop policy if exists alert_recipients_company_policy on public.alert_recipients;
drop policy if exists stock_movements_company_policy on public.stock_movements;
drop policy if exists material_requests_company_policy on public.material_requests;
drop policy if exists quote_lines_company_policy on public.quote_lines;
drop policy if exists work_order_equipment_company_policy on public.work_order_equipment;
drop policy if exists work_order_status_history_company_policy on public.work_order_status_history;
drop policy if exists work_order_photos_company_policy on public.work_order_photos;
drop policy if exists work_order_signatures_company_policy on public.work_order_signatures;
drop policy if exists check_template_sections_authenticated on public.check_template_sections;
drop policy if exists check_template_items_authenticated on public.check_template_items;
drop policy if exists alerts_select_company on public.alerts;
drop policy if exists alerts_write_roles on public.alerts;
drop policy if exists alerts_update_roles on public.alerts;

drop policy if exists check_templates_select_scoped on public.check_templates;
drop policy if exists check_templates_insert_admin on public.check_templates;
drop policy if exists check_templates_update_admin on public.check_templates;
drop policy if exists check_templates_delete_superadmin on public.check_templates;
create policy check_templates_select_scoped on public.check_templates for select to authenticated
  using ((company_id = public.current_company_id() or company_id is null) and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Tecnico']));
create policy check_templates_insert_admin on public.check_templates for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));
create policy check_templates_update_admin on public.check_templates for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));
create policy check_templates_delete_superadmin on public.check_templates for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists check_template_sections_select_scoped on public.check_template_sections;
drop policy if exists check_template_sections_insert_admin on public.check_template_sections;
drop policy if exists check_template_sections_update_admin on public.check_template_sections;
drop policy if exists check_template_sections_delete_superadmin on public.check_template_sections;
create policy check_template_sections_select_scoped on public.check_template_sections for select to authenticated
  using (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and (ct.company_id = public.current_company_id() or ct.company_id is null) and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Tecnico'])));
create policy check_template_sections_insert_admin on public.check_template_sections for insert to authenticated
  with check (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and ct.company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])));
create policy check_template_sections_update_admin on public.check_template_sections for update to authenticated
  using (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and ct.company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])))
  with check (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and ct.company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])));
create policy check_template_sections_delete_superadmin on public.check_template_sections for delete to authenticated
  using (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and ct.company_id = public.current_company_id() and public.is_superadmin()));

drop policy if exists check_template_items_select_scoped on public.check_template_items;
drop policy if exists check_template_items_insert_admin on public.check_template_items;
drop policy if exists check_template_items_update_admin on public.check_template_items;
drop policy if exists check_template_items_delete_superadmin on public.check_template_items;
create policy check_template_items_select_scoped on public.check_template_items for select to authenticated
  using (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and (ct.company_id = public.current_company_id() or ct.company_id is null) and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Tecnico'])));
create policy check_template_items_insert_admin on public.check_template_items for insert to authenticated
  with check (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and ct.company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])));
create policy check_template_items_update_admin on public.check_template_items for update to authenticated
  using (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and ct.company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])))
  with check (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and ct.company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])));
create policy check_template_items_delete_superadmin on public.check_template_items for delete to authenticated
  using (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and ct.company_id = public.current_company_id() and public.is_superadmin()));

drop policy if exists check_photos_select_scoped on public.check_photos;
drop policy if exists check_photos_insert_assigned on public.check_photos;
drop policy if exists check_photos_update_owner_or_admin on public.check_photos;
drop policy if exists check_photos_delete_superadmin on public.check_photos;
create policy check_photos_select_scoped on public.check_photos for select to authenticated
  using (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_photos.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))));
create policy check_photos_insert_assigned on public.check_photos for insert to authenticated
  with check (company_id = public.current_company_id() and taken_by = public.current_profile_id() and exists (select 1 from public.checks ch where ch.id = check_photos.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))));
create policy check_photos_update_owner_or_admin on public.check_photos for update to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia']) or taken_by = public.current_profile_id()))
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia']) or taken_by = public.current_profile_id()));
create policy check_photos_delete_superadmin on public.check_photos for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists cases_select_business on public.cases;
drop policy if exists cases_insert_business on public.cases;
drop policy if exists cases_update_business on public.cases;
drop policy if exists cases_delete_superadmin on public.cases;
create policy cases_select_business on public.cases for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
create policy cases_insert_business on public.cases for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial']));
create policy cases_update_business on public.cases for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']))
  with check (company_id = public.current_company_id());
create policy cases_delete_superadmin on public.cases for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists case_events_select_business on public.case_events;
drop policy if exists case_events_insert_business on public.case_events;
create policy case_events_select_business on public.case_events for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
create policy case_events_insert_business on public.case_events for insert to authenticated
  with check (company_id = public.current_company_id() and created_by = public.current_profile_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));

drop policy if exists case_links_select_business on public.case_links;
drop policy if exists case_links_insert_business on public.case_links;
create policy case_links_select_business on public.case_links for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
create policy case_links_insert_business on public.case_links for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));

drop policy if exists case_documents_select_business on public.case_documents;
drop policy if exists case_documents_insert_backoffice on public.case_documents;
create policy case_documents_select_business on public.case_documents for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
create policy case_documents_insert_backoffice on public.case_documents for insert to authenticated
  with check (company_id = public.current_company_id() and created_by = public.current_profile_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

drop policy if exists alerts_select_scoped on public.alerts;
drop policy if exists alerts_insert_authorized on public.alerts;
drop policy if exists alerts_update_authorized on public.alerts;
drop policy if exists alerts_delete_superadmin on public.alerts;
create policy alerts_select_scoped on public.alerts for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']) or created_by = public.current_profile_id() or exists (select 1 from public.alert_recipients ar where ar.alert_id = alerts.id and ar.company_id = public.current_company_id() and (ar.recipient_profile_id = public.current_profile_id() or ar.recipient_role in (select p.primary_area from public.profiles p where p.id = public.current_profile_id())))));
create policy alerts_insert_authorized on public.alerts for insert to authenticated
  with check (company_id = public.current_company_id() and created_by = public.current_profile_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina','Tecnico']));
create policy alerts_update_authorized on public.alerts for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id());
create policy alerts_delete_superadmin on public.alerts for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists alert_recipients_select_scoped on public.alert_recipients;
drop policy if exists alert_recipients_insert_authorized on public.alert_recipients;
drop policy if exists alert_recipients_update_recipient_or_admin on public.alert_recipients;
drop policy if exists alert_recipients_delete_superadmin on public.alert_recipients;
create policy alert_recipients_select_scoped on public.alert_recipients for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or recipient_profile_id = public.current_profile_id() or recipient_role in (select p.primary_area from public.profiles p where p.id = public.current_profile_id())));
create policy alert_recipients_insert_authorized on public.alert_recipients for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina','Tecnico']));
create policy alert_recipients_update_recipient_or_admin on public.alert_recipients for update to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or recipient_profile_id = public.current_profile_id() or recipient_role in (select p.primary_area from public.profiles p where p.id = public.current_profile_id())))
  with check (company_id = public.current_company_id());
create policy alert_recipients_delete_superadmin on public.alert_recipients for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists stock_movements_select_backoffice on public.stock_movements;
drop policy if exists stock_movements_insert_backoffice on public.stock_movements;
create policy stock_movements_select_backoffice on public.stock_movements for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy stock_movements_insert_backoffice on public.stock_movements for insert to authenticated
  with check (company_id = public.current_company_id() and created_by = public.current_profile_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

drop policy if exists material_requests_select_scoped on public.material_requests;
drop policy if exists material_requests_insert_scoped on public.material_requests;
drop policy if exists material_requests_update_backoffice on public.material_requests;
create policy material_requests_select_scoped on public.material_requests for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or requested_by = public.current_profile_id() or public.is_assigned_to_work_order(work_order_id)));
create policy material_requests_insert_scoped on public.material_requests for insert to authenticated
  with check (company_id = public.current_company_id() and requested_by = public.current_profile_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));
create policy material_requests_update_backoffice on public.material_requests for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id());

drop policy if exists quote_lines_select_commercial on public.quote_lines;
drop policy if exists quote_lines_insert_commercial on public.quote_lines;
drop policy if exists quote_lines_update_commercial on public.quote_lines;
drop policy if exists quote_lines_delete_superadmin on public.quote_lines;
create policy quote_lines_select_commercial on public.quote_lines for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quote_lines_insert_commercial on public.quote_lines for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy quote_lines_update_commercial on public.quote_lines for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']))
  with check (company_id = public.current_company_id());
create policy quote_lines_delete_superadmin on public.quote_lines for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists work_order_equipment_select_scoped on public.work_order_equipment;
drop policy if exists work_order_equipment_insert_admin on public.work_order_equipment;
drop policy if exists work_order_equipment_update_admin on public.work_order_equipment;
drop policy if exists work_order_equipment_delete_superadmin on public.work_order_equipment;
create policy work_order_equipment_select_scoped on public.work_order_equipment for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_equipment_insert_admin on public.work_order_equipment for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));
create policy work_order_equipment_update_admin on public.work_order_equipment for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']))
  with check (company_id = public.current_company_id());
create policy work_order_equipment_delete_superadmin on public.work_order_equipment for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists work_order_status_history_select_scoped on public.work_order_status_history;
drop policy if exists work_order_status_history_insert_operational on public.work_order_status_history;
create policy work_order_status_history_select_scoped on public.work_order_status_history for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_status_history_insert_operational on public.work_order_status_history for insert to authenticated
  with check (company_id = public.current_company_id() and changed_by = public.current_profile_id() and (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(work_order_id)));

drop policy if exists work_order_photos_select_scoped on public.work_order_photos;
drop policy if exists work_order_photos_insert_assigned on public.work_order_photos;
drop policy if exists work_order_photos_delete_superadmin on public.work_order_photos;
create policy work_order_photos_select_scoped on public.work_order_photos for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_photos_insert_assigned on public.work_order_photos for insert to authenticated
  with check (company_id = public.current_company_id() and taken_by = public.current_profile_id() and (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_photos_delete_superadmin on public.work_order_photos for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());

drop policy if exists work_order_signatures_select_scoped on public.work_order_signatures;
drop policy if exists work_order_signatures_insert_assigned on public.work_order_signatures;
drop policy if exists work_order_signatures_delete_superadmin on public.work_order_signatures;
create policy work_order_signatures_select_scoped on public.work_order_signatures for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_signatures_insert_assigned on public.work_order_signatures for insert to authenticated
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_signatures_delete_superadmin on public.work_order_signatures for delete to authenticated
  using (company_id = public.current_company_id() and public.is_superadmin());
