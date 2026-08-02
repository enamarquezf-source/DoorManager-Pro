-- DoorManager Pro - sincronizacion funcional end-to-end de checks, fotos, firmas e incidencias

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dmp-files', 'dmp-files', false, 10485760, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.files add column if not exists local_change_id text;
alter table public.check_photos add column if not exists local_change_id text;
alter table public.work_order_photos add column if not exists local_change_id text;
alter table public.work_order_signatures add column if not exists local_change_id text;
alter table public.deficiencies add column if not exists local_change_id text;
alter table public.work_order_notes add column if not exists local_change_id text;
alter table public.work_order_materials add column if not exists local_change_id text;

create unique index if not exists files_company_local_change_unique on public.files(company_id, local_change_id) where local_change_id is not null;
create unique index if not exists check_photos_company_local_change_unique on public.check_photos(company_id, local_change_id) where local_change_id is not null;
create unique index if not exists work_order_photos_company_local_change_unique on public.work_order_photos(company_id, local_change_id) where local_change_id is not null;
create unique index if not exists work_order_signatures_company_local_change_unique on public.work_order_signatures(company_id, local_change_id) where local_change_id is not null;
create unique index if not exists deficiencies_company_local_change_unique on public.deficiencies(company_id, local_change_id) where local_change_id is not null;
create unique index if not exists work_order_notes_company_local_change_unique on public.work_order_notes(company_id, local_change_id) where local_change_id is not null;
create unique index if not exists work_order_materials_company_local_change_unique on public.work_order_materials(company_id, local_change_id) where local_change_id is not null;

create or replace function public.dmp_storage_company_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(split_part(p_name, '/', 1), '')::uuid;
$$;

create or replace function public.dmp_storage_resource_type(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(split_part(p_name, '/', 2), '');
$$;

create or replace function public.dmp_storage_resource_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(split_part(p_name, '/', 3), '')::uuid;
$$;

create or replace function public.can_read_dmp_storage_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_type text;
  v_resource_id uuid;
begin
  begin
    v_company_id := public.dmp_storage_company_id(p_name);
    v_type := public.dmp_storage_resource_type(p_name);
    v_resource_id := public.dmp_storage_resource_id(p_name);
  exception when others then
    return false;
  end;
  if v_company_id is null or v_resource_id is null or v_company_id <> public.current_company_id() then return false; end if;
  if v_type = 'checks' then
    return exists (select 1 from public.checks ch where ch.id = v_resource_id and ch.company_id = v_company_id and ch.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id, public.current_profile_id())));
  elsif v_type = 'work-orders' then
    return exists (select 1 from public.work_orders wo where wo.id = v_resource_id and wo.company_id = v_company_id and wo.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(wo.id, public.current_profile_id())));
  end if;
  return false;
end;
$$;

create or replace function public.can_write_dmp_storage_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_type text;
  v_resource_id uuid;
begin
  begin
    v_company_id := public.dmp_storage_company_id(p_name);
    v_type := public.dmp_storage_resource_type(p_name);
    v_resource_id := public.dmp_storage_resource_id(p_name);
  exception when others then
    return false;
  end;
  if v_company_id is null or v_resource_id is null or v_company_id <> public.current_company_id() then return false; end if;
  if v_type = 'checks' then
    return exists (select 1 from public.checks ch where ch.id = v_resource_id and ch.company_id = v_company_id and ch.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id, public.current_profile_id())));
  elsif v_type = 'work-orders' then
    return exists (select 1 from public.work_orders wo where wo.id = v_resource_id and wo.company_id = v_company_id and wo.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(wo.id, public.current_profile_id())));
  end if;
  return false;
end;
$$;

drop policy if exists dmp_files_storage_select on storage.objects;
drop policy if exists dmp_files_storage_insert on storage.objects;
drop policy if exists dmp_files_storage_update on storage.objects;
create policy dmp_files_storage_select on storage.objects for select to authenticated using (bucket_id = 'dmp-files' and public.can_read_dmp_storage_object(name));
create policy dmp_files_storage_insert on storage.objects for insert to authenticated with check (bucket_id = 'dmp-files' and owner = auth.uid() and public.can_write_dmp_storage_object(name));
create policy dmp_files_storage_update on storage.objects for update to authenticated using (bucket_id = 'dmp-files' and (owner = auth.uid() or public.has_any_role(array['superadmin','SAT','Gerencia'])) and public.can_write_dmp_storage_object(name)) with check (bucket_id = 'dmp-files' and public.can_write_dmp_storage_object(name));

create or replace function public.assert_dmp_storage_path(p_path text, p_company_id uuid, p_type text, p_resource_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_path is null or p_path not like p_company_id::text || '/' || p_type || '/' || p_resource_id::text || '/%' then
    raise exception 'Ruta de Storage no valida para la empresa y recurso';
  end if;
end;
$$;

create or replace function public.register_check_photo(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_check public.checks;
  v_file_id uuid;
  v_photo_id uuid;
  v_local_change_id text := nullif(p_payload->>'local_change_id', '');
begin
  select * into v_check from public.checks where id = (p_payload->>'check_id')::uuid and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = v_profile_id or public.is_assigned_to_work_order(v_check.work_order_id, v_profile_id)) then raise exception 'No tienes permisos para adjuntar fotos a este check'; end if;
  if p_payload->>'bucket' <> 'dmp-files' then raise exception 'Bucket no valido'; end if;
  perform public.assert_dmp_storage_path(p_payload->>'path', v_check.company_id, 'checks', v_check.id);

  insert into public.files(company_id, bucket, path, name, mime_type, size_bytes, uploaded_by, description, metadata, local_change_id)
  values (v_check.company_id, 'dmp-files', p_payload->>'path', p_payload->>'name', p_payload->>'mime_type', nullif(p_payload->>'size_bytes', '')::bigint, v_profile_id, nullif(p_payload->>'description', ''), coalesce(p_payload->'metadata', '{}'::jsonb), v_local_change_id)
  on conflict (bucket, path) do update set uploaded_at = now(), uploaded_by = excluded.uploaded_by, description = excluded.description, metadata = excluded.metadata, local_change_id = coalesce(public.files.local_change_id, excluded.local_change_id)
  returning id into v_file_id;

  insert into public.check_photos(company_id, check_id, item_result_id, file_id, taken_by, description, local_change_id)
  values (v_check.company_id, v_check.id, nullif(p_payload->>'item_result_id', '')::uuid, v_file_id, v_profile_id, nullif(p_payload->>'description', ''), v_local_change_id)
  on conflict (company_id, local_change_id) where local_change_id is not null do update set file_id = excluded.file_id, description = excluded.description
  returning id into v_photo_id;
  return v_photo_id;
end;
$$;

create or replace function public.register_work_order_photo(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work public.work_orders;
  v_file_id uuid;
  v_photo_id uuid;
  v_local_change_id text := nullif(p_payload->>'local_change_id', '');
begin
  select * into v_work from public.work_orders where id = (p_payload->>'work_order_id')::uuid and deleted_at is null for update;
  if v_work.id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(v_work.id, v_profile_id)) then raise exception 'No tienes permisos para adjuntar fotos a este parte'; end if;
  if p_payload->>'bucket' <> 'dmp-files' then raise exception 'Bucket no valido'; end if;
  perform public.assert_dmp_storage_path(p_payload->>'path', v_work.company_id, 'work-orders', v_work.id);

  insert into public.files(company_id, bucket, path, name, mime_type, size_bytes, uploaded_by, description, metadata, local_change_id)
  values (v_work.company_id, 'dmp-files', p_payload->>'path', p_payload->>'name', p_payload->>'mime_type', nullif(p_payload->>'size_bytes', '')::bigint, v_profile_id, nullif(p_payload->>'description', ''), coalesce(p_payload->'metadata', '{}'::jsonb), v_local_change_id)
  on conflict (bucket, path) do update set uploaded_at = now(), uploaded_by = excluded.uploaded_by, description = excluded.description, metadata = excluded.metadata, local_change_id = coalesce(public.files.local_change_id, excluded.local_change_id)
  returning id into v_file_id;

  insert into public.work_order_photos(company_id, work_order_id, file_id, taken_by, description, local_change_id)
  values (v_work.company_id, v_work.id, v_file_id, v_profile_id, nullif(p_payload->>'description', ''), v_local_change_id)
  on conflict (company_id, local_change_id) where local_change_id is not null do update set file_id = excluded.file_id, description = excluded.description
  returning id into v_photo_id;
  return v_photo_id;
end;
$$;

create or replace function public.register_work_order_signature(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work public.work_orders;
  v_file_id uuid;
  v_signature_id uuid;
  v_local_change_id text := nullif(p_payload->>'local_change_id', '');
begin
  select * into v_work from public.work_orders where id = (p_payload->>'work_order_id')::uuid and deleted_at is null for update;
  if v_work.id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(v_work.id, v_profile_id)) then raise exception 'No tienes permisos para firmar este parte'; end if;
  if p_payload->>'bucket' <> 'dmp-files' then raise exception 'Bucket no valido'; end if;
  if trim(coalesce(p_payload->>'signer_name', '')) = '' then raise exception 'Nombre de firmante obligatorio'; end if;
  if coalesce((p_payload->>'accepted_terms')::boolean, false) is not true then raise exception 'Aceptacion expresa obligatoria'; end if;
  perform public.assert_dmp_storage_path(p_payload->>'path', v_work.company_id, 'work-orders', v_work.id);

  insert into public.files(company_id, bucket, path, name, mime_type, size_bytes, uploaded_by, description, metadata, local_change_id)
  values (v_work.company_id, 'dmp-files', p_payload->>'path', p_payload->>'name', p_payload->>'mime_type', nullif(p_payload->>'size_bytes', '')::bigint, v_profile_id, 'Firma de parte', coalesce(p_payload->'metadata', '{}'::jsonb), v_local_change_id)
  on conflict (bucket, path) do update set uploaded_at = now(), uploaded_by = excluded.uploaded_by, metadata = excluded.metadata, local_change_id = coalesce(public.files.local_change_id, excluded.local_change_id)
  returning id into v_file_id;

  insert into public.work_order_signatures(company_id, work_order_id, signer_name, signer_role, signer_document, file_id, accepted_terms, local_change_id)
  values (v_work.company_id, v_work.id, trim(p_payload->>'signer_name'), nullif(p_payload->>'signer_role', ''), nullif(p_payload->>'signer_document', ''), v_file_id, true, v_local_change_id)
  on conflict (company_id, local_change_id) where local_change_id is not null do update set file_id = excluded.file_id, signer_name = excluded.signer_name, signer_role = excluded.signer_role, signer_document = excluded.signer_document
  returning id into v_signature_id;
  return v_signature_id;
end;
$$;

create or replace function public.register_check_deficiency(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_check public.checks;
  v_id uuid;
  v_code text;
  v_severity text := p_payload->>'severity';
  v_local_change_id text := nullif(p_payload->>'local_change_id', '');
  v_description text := trim(coalesce(p_payload->>'description', ''));
  v_component text := trim(coalesce(p_payload->>'component', ''));
begin
  select * into v_check from public.checks where id = (p_payload->>'check_id')::uuid and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = v_profile_id or public.is_assigned_to_work_order(v_check.work_order_id, v_profile_id)) then raise exception 'No tienes permisos para crear deficiencias de este check'; end if;
  if v_description = '' then raise exception 'Descripcion de deficiencia obligatoria'; end if;
  v_severity := case v_severity when 'Leve' then 'Baja' when 'Critica' then 'Critica' else coalesce(v_severity, 'Media') end;
  if v_severity not in ('Baja','Media','Alta','Critica') then v_severity := 'Media'; end if;

  select id into v_id from public.deficiencies where company_id = v_check.company_id and local_change_id = v_local_change_id and v_local_change_id is not null;
  if v_id is not null then return v_id; end if;

  v_code := public.next_dmp_code(v_check.company_id, 'deficiencies', 'DEF', true, 6);
  insert into public.deficiencies(company_id, code, check_id, section_id, item_id, work_order_id, equipment_id, client_id, site_id, severity, description, recommended_action, responsible_profile_id, local_change_id)
  select v_check.company_id, v_code, v_check.id, nullif(p_payload->>'section_id', '')::uuid, nullif(p_payload->>'item_id', '')::uuid, v_check.work_order_id, e.id, e.client_id, e.site_id, v_severity, v_description, nullif(p_payload->>'recommended_action', ''), v_profile_id, v_local_change_id
  from public.equipment e
  where e.id = v_check.equipment_id and e.company_id = v_check.company_id
  returning id into v_id;
  if v_id is null then raise exception 'Equipo de check no valido'; end if;
  return v_id;
end;
$$;

create or replace function public.register_work_order_deficiency(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_work public.work_orders;
  v_check public.checks;
  v_equipment_id uuid;
  v_id uuid;
  v_code text;
  v_severity text := p_payload->>'severity';
  v_local_change_id text := nullif(p_payload->>'local_change_id', '');
  v_description text := trim(coalesce(p_payload->>'description', ''));
begin
  select * into v_work from public.work_orders where id = (p_payload->>'work_order_id')::uuid and deleted_at is null for update;
  if v_work.id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_work.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(v_work.id, v_profile_id)) then raise exception 'No tienes permisos para crear incidencias de este parte'; end if;
  if v_description = '' then raise exception 'Descripcion de incidencia obligatoria'; end if;
  if nullif(p_payload->>'check_id', '') is not null then
    select * into v_check from public.checks where id = (p_payload->>'check_id')::uuid and work_order_id = v_work.id and company_id = v_work.company_id and deleted_at is null;
    if v_check.id is null then raise exception 'Check asociado no valido para este parte'; end if;
  end if;
  v_severity := case v_severity when 'Leve' then 'Baja' when 'Critica' then 'Critica' else coalesce(v_severity, 'Media') end;
  if v_severity not in ('Baja','Media','Alta','Critica') then v_severity := 'Media'; end if;
  select id into v_id from public.deficiencies where company_id = v_work.company_id and local_change_id = v_local_change_id and v_local_change_id is not null;
  if v_id is not null then return v_id; end if;
  v_equipment_id := coalesce(v_check.equipment_id, v_work.main_equipment_id);
  if v_equipment_id is null then
    select equipment_id into v_equipment_id from public.work_order_equipment where work_order_id = v_work.id and company_id = v_work.company_id order by is_primary desc, created_at limit 1;
  end if;
  if v_equipment_id is null then raise exception 'El parte no tiene equipo asociado para vincular la incidencia'; end if;
  v_code := public.next_dmp_code(v_work.company_id, 'deficiencies', 'DEF', true, 6);
  insert into public.deficiencies(company_id, code, check_id, section_id, item_id, work_order_id, equipment_id, client_id, site_id, severity, description, recommended_action, responsible_profile_id, local_change_id)
  select v_work.company_id, v_code, v_check.id, null, null, v_work.id, e.id, e.client_id, e.site_id, v_severity, case when v_component = '' then v_description else '[' || v_component || '] ' || v_description end, nullif(p_payload->>'recommended_action', ''), v_profile_id, v_local_change_id
  from public.equipment e
  where e.id = v_equipment_id and e.company_id = v_work.company_id
  returning id into v_id;
  if v_id is null then raise exception 'Equipo del parte no valido'; end if;
  return v_id;
end;
$$;

create or replace function public.finish_check_safe(p_check_id uuid, p_observations text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_check public.checks;
  v_missing integer;
  v_global_result text;
begin
  select * into v_check from public.checks where id = p_check_id and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = v_profile_id or public.is_assigned_to_work_order(v_check.work_order_id, v_profile_id)) then raise exception 'No tienes permisos para finalizar este check'; end if;
  select count(*) into v_missing
  from public.check_template_sections s
  where s.template_id = v_check.template_id
    and not exists (select 1 from public.check_section_results r where r.check_id = v_check.id and r.section_id = s.id and r.result <> 'Sin revisar');
  if v_missing > 0 then raise exception 'No se puede finalizar: hay secciones sin sincronizar'; end if;

  select case
    when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'No favorable') then 'No favorable'
    when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'Problema leve') then 'Problema leve'
    when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'Favorable tras intervencion') then 'Favorable tras intervencion'
    else 'Todo favorable'
  end into v_global_result;

  perform public.finish_check(p_check_id, v_profile_id, v_global_result, p_observations);
  return v_global_result;
end;
$$;

create or replace function public.sync_work_order_note(p_work_order_id uuid, p_note text, p_local_change_id text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(p_work_order_id, v_profile_id)) then raise exception 'No tienes permisos para sincronizar este parte'; end if;
  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by, local_change_id)
  values (v_company_id, p_work_order_id, trim(p_note), 'Tecnica', v_profile_id, nullif(p_local_change_id, ''))
  on conflict (company_id, local_change_id) where local_change_id is not null do update set note = excluded.note
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sync_work_order_material_usage(p_work_order_id uuid, p_description text, p_quantity numeric default 1, p_local_change_id text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_company_id uuid;
  v_material_id uuid;
  v_usage_id uuid;
  v_description text := trim(coalesce(p_description, ''));
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  perform public.assert_member_of_current_company(v_company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(p_work_order_id, v_profile_id)) then raise exception 'No tienes permisos para sincronizar material de este parte'; end if;
  if v_description = '' then raise exception 'Material obligatorio'; end if;
  select id into v_usage_id from public.work_order_materials where company_id = v_company_id and local_change_id = nullif(p_local_change_id, '');
  if v_usage_id is not null then return v_usage_id; end if;
  select id into v_material_id from public.materials where company_id = v_company_id and lower(description) = lower(v_description) and deleted_at is null limit 1;
  if v_material_id is null then
    insert into public.materials(company_id, code, description, unit, active)
    values (v_company_id, public.next_dmp_code(v_company_id, 'materials', 'MAT', false, 6), v_description, 'ud', true)
    returning id into v_material_id;
  end if;
  insert into public.work_order_materials(company_id, work_order_id, material_id, used_quantity, notes, local_change_id)
  values (v_company_id, p_work_order_id, v_material_id, greatest(coalesce(p_quantity, 1), 0), 'Sincronizado desde modo tecnico offline', nullif(p_local_change_id, ''))
  returning id into v_usage_id;
  insert into public.work_order_notes(company_id, work_order_id, note, visibility, created_by, local_change_id)
  values (v_company_id, p_work_order_id, 'Material usado: ' || v_description || ' · Cantidad: ' || greatest(coalesce(p_quantity, 1), 0)::text, 'Tecnica', v_profile_id, nullif(p_local_change_id, '') || ':note')
  on conflict (company_id, local_change_id) where local_change_id is not null do nothing;
  return v_usage_id;
end;
$$;

grant execute on function public.register_check_photo(jsonb) to authenticated;
grant execute on function public.register_work_order_photo(jsonb) to authenticated;
grant execute on function public.register_work_order_signature(jsonb) to authenticated;
grant execute on function public.register_check_deficiency(jsonb) to authenticated;
grant execute on function public.register_work_order_deficiency(jsonb) to authenticated;
grant execute on function public.finish_check_safe(uuid, text) to authenticated;
grant execute on function public.sync_work_order_note(uuid, text, text) to authenticated;
grant execute on function public.sync_work_order_material_usage(uuid, text, numeric, text) to authenticated;
