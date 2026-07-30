-- DoorManager Pro - auditoria seguridad: RLS, privilegios, integridad y transacciones criticas

create or replace function public.has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and p.company_id = public.current_company_id()
      and p.primary_area = role_name
  ) or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and p.company_id = public.current_company_id()
      and r.name = role_name
  );
$$;

create or replace function public.has_any_role(role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and p.company_id = public.current_company_id()
      and p.primary_area = any(role_names)
  ) or exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and p.company_id = public.current_company_id()
      and r.name = any(role_names)
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
      and p.company_id = public.current_company_id()
      and p.primary_area = 'superadmin'
  );
$$;

create or replace function public.is_assigned_to_work_order(p_work_order_id uuid, p_profile_id uuid default public.current_profile_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.company_id = public.current_company_id()
      and wo.deleted_at is null
      and (wo.main_technician_id = p_profile_id or wo.current_responsible_id = p_profile_id)
  ) or exists (
    select 1 from public.work_order_assignments a
    where a.work_order_id = p_work_order_id
      and a.company_id = public.current_company_id()
      and a.technician_id = p_profile_id
      and a.deleted_at is null
  ) or exists (
    select 1 from public.checks ch
    where ch.work_order_id = p_work_order_id
      and ch.company_id = public.current_company_id()
      and ch.technician_id = p_profile_id
      and ch.deleted_at is null
  );
$$;

create or replace function public.update_own_profile_safe(p_first_name text default null, p_last_name text default null, p_phone text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  update public.profiles
  set first_name = coalesce(nullif(p_first_name, ''), first_name),
      last_name = coalesce(nullif(p_last_name, ''), last_name),
      phone = case when p_phone is null then phone else nullif(p_phone, '') end
  where id = public.current_profile_id()
    and company_id = public.current_company_id()
    and active = true
    and deleted_at is null
  returning * into v_profile;

  if v_profile.id is null then raise exception 'Perfil no encontrado o inactivo'; end if;
  return v_profile;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','profile_roles','clients','sites','equipment','work_orders','work_order_assignments','work_order_notes',
    'checks','check_section_results','check_item_results','deficiencies','corrective_actions','documents','document_links',
    'materials','warehouses','warehouse_stock','work_order_materials','opportunities','quotes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_company_policy', t);
  end loop;
end $$;

drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_read_own_company on public.profiles;
drop policy if exists profiles_select_company_or_superadmin on public.profiles;
drop policy if exists profiles_update_superadmin_only on public.profiles;
drop policy if exists profiles_insert_superadmin_company on public.profiles;
drop policy if exists profiles_write_superadmin_only on public.profiles;

create policy profiles_select_scoped on public.profiles for select to authenticated
  using (company_id = public.current_company_id() and active = true and deleted_at is null);
create policy profiles_insert_superadmin_only on public.profiles for insert to authenticated
  with check (public.is_superadmin() and company_id = public.current_company_id());
create policy profiles_update_superadmin_only on public.profiles for update to authenticated
  using (public.is_superadmin() and company_id = public.current_company_id())
  with check (public.is_superadmin() and company_id = public.current_company_id());

drop policy if exists profile_roles_authenticated_company on public.profile_roles;
drop policy if exists profile_roles_select_company_or_superadmin on public.profile_roles;
drop policy if exists profile_roles_write_superadmin_only on public.profile_roles;
drop policy if exists profile_roles_delete_superadmin_only on public.profile_roles;
create policy profile_roles_select_company on public.profile_roles for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()));
create policy profile_roles_insert_superadmin on public.profile_roles for insert to authenticated
  with check (public.is_superadmin() and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()));
create policy profile_roles_delete_superadmin on public.profile_roles for delete to authenticated
  using (public.is_superadmin() and exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()));

drop policy if exists work_orders_select_company on public.work_orders;
drop policy if exists work_orders_write_roles on public.work_orders;
drop policy if exists work_orders_update_roles on public.work_orders;
create policy work_orders_select_by_role on public.work_orders for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or public.is_assigned_to_work_order(id)));
create policy work_orders_insert_operational on public.work_orders for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']));
create policy work_orders_update_operational on public.work_orders for update to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or current_responsible_id = public.current_profile_id() or public.is_assigned_to_work_order(id)))
  with check (company_id = public.current_company_id());
create policy work_orders_delete_superadmin on public.work_orders for delete to authenticated
  using (public.is_superadmin() and company_id = public.current_company_id());

drop policy if exists checks_select_company on public.checks;
drop policy if exists checks_write_roles on public.checks;
drop policy if exists checks_update_roles on public.checks;
create policy checks_select_by_role on public.checks for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or technician_id = public.current_profile_id() or public.is_assigned_to_work_order(work_order_id)));
create policy checks_insert_operational on public.checks for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));
create policy checks_update_assigned_or_admin on public.checks for update to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia']) or technician_id = public.current_profile_id() or public.is_assigned_to_work_order(work_order_id)))
  with check (company_id = public.current_company_id());

drop policy if exists check_section_results_authenticated on public.check_section_results;
drop policy if exists check_item_results_authenticated on public.check_item_results;
drop policy if exists check_section_results_access on public.check_section_results;
drop policy if exists check_item_results_access on public.check_item_results;
create policy check_section_results_select on public.check_section_results for select to authenticated
  using (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_section_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))))
;
create policy check_section_results_insert on public.check_section_results for insert to authenticated
  with check (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_section_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))));
create policy check_section_results_update on public.check_section_results for update to authenticated
  using (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_section_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))))
  with check (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_section_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))));
create policy check_item_results_select on public.check_item_results for select to authenticated
  using (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_item_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))))
;
create policy check_item_results_insert on public.check_item_results for insert to authenticated
  with check (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_item_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))));
create policy check_item_results_update on public.check_item_results for update to authenticated
  using (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_item_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))))
  with check (company_id = public.current_company_id() and exists (select 1 from public.checks ch where ch.id = check_item_results.check_id and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id))));

drop policy if exists clients_select_company on public.clients;
drop policy if exists clients_write_roles on public.clients;
drop policy if exists clients_update_roles on public.clients;
create policy clients_select_business on public.clients for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']));
create policy clients_insert_business on public.clients for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']));
create policy clients_update_business on public.clients for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']))
  with check (company_id = public.current_company_id());

drop policy if exists sites_select_company on public.sites;
drop policy if exists sites_write_roles on public.sites;
drop policy if exists sites_update_roles on public.sites;
create policy sites_select_business on public.sites for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']));
create policy sites_insert_business on public.sites for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']));
create policy sites_update_business on public.sites for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']))
  with check (company_id = public.current_company_id());

drop policy if exists equipment_select_company on public.equipment;
drop policy if exists equipment_write_roles on public.equipment;
drop policy if exists equipment_update_roles on public.equipment;
create policy equipment_select_business on public.equipment for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']));
create policy equipment_insert_sat on public.equipment for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));
create policy equipment_update_sat on public.equipment for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id());

create or replace function public.validate_company_relations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'sites' then
    if not exists (select 1 from public.clients c where c.id = NEW.client_id and c.company_id = NEW.company_id and c.deleted_at is null) then raise exception 'Cliente no pertenece a la empresa'; end if;
  elsif TG_TABLE_NAME = 'equipment' then
    if not exists (select 1 from public.clients c where c.id = NEW.client_id and c.company_id = NEW.company_id and c.deleted_at is null) then raise exception 'Cliente no pertenece a la empresa'; end if;
    if not exists (select 1 from public.sites s where s.id = NEW.site_id and s.company_id = NEW.company_id and s.client_id = NEW.client_id and s.deleted_at is null) then raise exception 'Centro incompatible con cliente/empresa'; end if;
  elsif TG_TABLE_NAME = 'work_orders' then
    if not exists (select 1 from public.clients c where c.id = NEW.client_id and c.company_id = NEW.company_id and c.deleted_at is null) then raise exception 'Cliente no pertenece a la empresa'; end if;
    if not exists (select 1 from public.sites s where s.id = NEW.site_id and s.company_id = NEW.company_id and s.client_id = NEW.client_id and s.deleted_at is null) then raise exception 'Centro incompatible con cliente/empresa'; end if;
    if NEW.main_equipment_id is not null and not exists (select 1 from public.equipment e where e.id = NEW.main_equipment_id and e.company_id = NEW.company_id and e.client_id = NEW.client_id and e.site_id = NEW.site_id and e.deleted_at is null) then raise exception 'Equipo incompatible con cliente/centro/empresa'; end if;
  elsif TG_TABLE_NAME = 'checks' then
    if not exists (select 1 from public.equipment e where e.id = NEW.equipment_id and e.company_id = NEW.company_id and e.deleted_at is null) then raise exception 'Equipo incompatible con empresa'; end if;
    if NEW.work_order_id is not null and not exists (select 1 from public.work_orders wo join public.equipment e on e.id = NEW.equipment_id where wo.id = NEW.work_order_id and wo.company_id = NEW.company_id and e.company_id = NEW.company_id and wo.client_id = e.client_id and wo.site_id = e.site_id and wo.deleted_at is null) then raise exception 'Check incompatible con parte/equipo'; end if;
  elsif TG_TABLE_NAME = 'deficiencies' then
    if not exists (select 1 from public.clients c where c.id = NEW.client_id and c.company_id = NEW.company_id and c.deleted_at is null) then raise exception 'Cliente no pertenece a la empresa'; end if;
    if not exists (select 1 from public.sites s where s.id = NEW.site_id and s.company_id = NEW.company_id and s.client_id = NEW.client_id and s.deleted_at is null) then raise exception 'Centro incompatible con cliente/empresa'; end if;
    if not exists (select 1 from public.equipment e where e.id = NEW.equipment_id and e.company_id = NEW.company_id and e.client_id = NEW.client_id and e.site_id = NEW.site_id and e.deleted_at is null) then raise exception 'Equipo incompatible con cliente/centro/empresa'; end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sites_validate_relations on public.sites;
create trigger trg_sites_validate_relations before insert or update on public.sites for each row execute function public.validate_company_relations();
drop trigger if exists trg_equipment_validate_relations on public.equipment;
create trigger trg_equipment_validate_relations before insert or update on public.equipment for each row execute function public.validate_company_relations();
drop trigger if exists trg_work_orders_validate_relations on public.work_orders;
create trigger trg_work_orders_validate_relations before insert or update on public.work_orders for each row execute function public.validate_company_relations();
drop trigger if exists trg_checks_validate_relations on public.checks;
create trigger trg_checks_validate_relations before insert or update on public.checks for each row execute function public.validate_company_relations();
drop trigger if exists trg_deficiencies_validate_relations on public.deficiencies;
create trigger trg_deficiencies_validate_relations before insert or update on public.deficiencies for each row execute function public.validate_company_relations();

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
  v_id uuid;
  v_code text;
begin
  perform public.assert_member_of_current_company(v_company_id);
  if v_created_by <> public.current_profile_id() then raise exception 'Creador no valido'; end if;
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia']) then raise exception 'No tienes permisos para crear partes'; end if;
  if not exists (select 1 from public.clients where id = v_client_id and company_id = v_company_id and deleted_at is null) then raise exception 'Cliente no valido'; end if;
  if not exists (select 1 from public.sites where id = v_site_id and company_id = v_company_id and client_id = v_client_id and deleted_at is null) then raise exception 'Centro no valido'; end if;
  if v_equipment_id is not null and not exists (select 1 from public.equipment where id = v_equipment_id and company_id = v_company_id and client_id = v_client_id and site_id = v_site_id and deleted_at is null) then raise exception 'Equipo no valido'; end if;

  v_code := public.next_dmp_code(v_company_id, 'work_orders', 'PAR', true, 6);
  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, scheduled_date, scheduled_time, estimated_duration_minutes, contact_id, access_requirement_id, planned_material, created_by, created_role, updated_by, current_responsible_id)
  values (v_company_id, v_code, nullif(p_payload->>'case_id', '')::uuid, v_client_id, v_site_id, v_equipment_id, p_payload->>'title', nullif(p_payload->>'description', ''), p_payload->>'type', coalesce(nullif(p_payload->>'priority', ''), 'Normal'), p_payload->>'origin', nullif(p_payload->>'scheduled_date', '')::date, nullif(p_payload->>'scheduled_time', '')::time, nullif(p_payload->>'estimated_duration_minutes', '')::integer, nullif(p_payload->>'contact_id', '')::uuid, nullif(p_payload->>'access_requirement_id', '')::uuid, nullif(p_payload->>'planned_material', ''), v_created_by, p_payload->>'created_role', v_created_by, coalesce(v_technician_id, v_created_by))
  returning id into v_id;

  if v_technician_id is not null then
    perform public.assign_technician(v_id, v_technician_id, coalesce(nullif(p_payload->>'scheduled_date', '')::date, current_date), nullif(p_payload->>'scheduled_time', '')::time, null, 'Principal', v_created_by);
  end if;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (v_company_id, v_id, null, 'Pendiente', v_created_by, 'Creacion transaccional de parte ' || v_code);
  return v_id;
end;
$$;

create or replace function public.save_check_block_result(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check public.checks;
  v_section_result_id uuid;
  v_item jsonb;
  v_result text := p_payload->>'result';
begin
  select * into v_check from public.checks where id = (p_payload->>'check_id')::uuid and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(v_check.work_order_id)) then
    raise exception 'No tienes permisos para guardar este check';
  end if;

  insert into public.check_section_results(company_id, check_id, section_id, result, observations)
  values (v_check.company_id, v_check.id, (p_payload->>'section_id')::uuid, v_result, nullif(p_payload->>'observations', ''))
  on conflict (check_id, section_id) do update set result = excluded.result, observations = excluded.observations, updated_at = now()
  returning id into v_section_result_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    insert into public.check_item_results(company_id, check_id, section_result_id, item_id, result, observations)
    values (v_check.company_id, v_check.id, v_section_result_id, (v_item->>'id')::uuid, v_result, nullif(p_payload->>'observations', ''))
    on conflict (check_id, item_id) do update set section_result_id = excluded.section_result_id, result = excluded.result, observations = excluded.observations, updated_at = now();
  end loop;

  update public.checks
  set status = 'En curso', global_result = v_result, observations = coalesce(nullif(p_payload->>'observations', ''), observations), started_at = coalesce(started_at, now()), updated_at = now()
  where id = v_check.id;

  return v_section_result_id;
end;
$$;

grant execute on function public.update_own_profile_safe(text, text, text) to authenticated;
grant execute on function public.is_assigned_to_work_order(uuid, uuid) to authenticated;
grant execute on function public.create_work_order_full(jsonb) to authenticated;
grant execute on function public.save_check_block_result(jsonb) to authenticated;

drop policy if exists work_order_assignments_company_policy on public.work_order_assignments;
create policy work_order_assignments_select_scoped on public.work_order_assignments for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or technician_id = public.current_profile_id()));
create policy work_order_assignments_insert_admin on public.work_order_assignments for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']));
create policy work_order_assignments_update_admin on public.work_order_assignments for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia']))
  with check (company_id = public.current_company_id());

create policy work_order_notes_select on public.work_order_notes for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)))
;
create policy work_order_notes_insert on public.work_order_notes for insert to authenticated
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_notes_update on public.work_order_notes for update to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)))
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_materials_select on public.work_order_materials for select to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)))
;
create policy work_order_materials_insert on public.work_order_materials for insert to authenticated
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));
create policy work_order_materials_update on public.work_order_materials for update to authenticated
  using (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)))
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(work_order_id)));

create policy documents_select_admin on public.documents for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy documents_write_admin on public.documents for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy document_links_select_admin on public.document_links for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy document_links_write_admin on public.document_links for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

create policy deficiencies_select_scoped on public.deficiencies for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or public.is_assigned_to_work_order(work_order_id)));
create policy deficiencies_write_operational on public.deficiencies for insert to authenticated
  with check (company_id = public.current_company_id() and (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(work_order_id)));
create policy corrective_actions_select on public.corrective_actions for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
;
create policy corrective_actions_insert on public.corrective_actions for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy corrective_actions_update on public.corrective_actions for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

create policy materials_select_backoffice on public.materials for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy materials_write_backoffice on public.materials for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy warehouses_select_backoffice on public.warehouses for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy warehouse_stock_select_backoffice on public.warehouse_stock for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

create policy opportunities_select_commercial on public.opportunities for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy opportunities_write_commercial on public.opportunities for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
create policy quotes_select_commercial on public.quotes for select to authenticated
  using (company_id = public.current_company_id() and deleted_at is null and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quotes_write_commercial on public.quotes for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT']));
