-- DoorManager Pro - fotos reales de equipo y foto principal
-- 116 es transaccional. No modifica las policies globales de storage.objects:
-- 020 ya delega en can_read/write_dmp_storage_object(name).

begin;

alter table public.equipment_photos
  add column if not exists is_primary boolean not null default false;

create unique index if not exists equipment_photos_one_primary_idx
  on public.equipment_photos (equipment_id)
  where is_primary = true;

-- La policy generica inicial era FOR ALL y permitia DELETE. Este cambio conserva
-- el historico: solo se reemplaza la policy de esta tabla, no Storage ni media
-- de checks/partes.
drop policy if exists equipment_photos_company_policy on public.equipment_photos;
drop policy if exists equipment_photos_select on public.equipment_photos;
drop policy if exists equipment_photos_insert on public.equipment_photos;
drop policy if exists equipment_photos_update on public.equipment_photos;
drop policy if exists equipment_photos_delete on public.equipment_photos;

create or replace function public.can_read_equipment_photo(p_equipment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_equipment_id is null or public.current_company_id() is null then
    return false;
  end if;
  return exists (
    select 1 from public.equipment e
    where e.id = p_equipment_id
      and e.company_id = public.current_company_id()
      and e.deleted_at is null
      and (
        public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial'])
        or (public.has_any_role(array['Tecnico']) and exists (
          select 1
          from public.checks ch
          where ch.equipment_id = e.id
            and ch.company_id = e.company_id
            and ch.deleted_at is null
            and (ch.technician_id = public.current_profile_id()
                 or public.is_assigned_to_work_order(ch.work_order_id, public.current_profile_id()))
        ))
        or (public.has_any_role(array['Tecnico']) and exists (
          select 1
          from public.work_order_equipment woe
          join public.work_orders wo on wo.id = woe.work_order_id
          where woe.equipment_id = e.id
            and woe.company_id = e.company_id
            and wo.company_id = e.company_id
            and wo.deleted_at is null
            and public.is_assigned_to_work_order(wo.id, public.current_profile_id())
        ))
      )
  );
end;
$$;

create or replace function public.can_manage_equipment_photo(p_equipment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_equipment_id is null or public.current_company_id() is null then
    return false;
  end if;
  return exists (
    select 1 from public.equipment e
    where e.id = p_equipment_id
      and e.company_id = public.current_company_id()
      and e.deleted_at is null
      and (
        public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
        or (public.has_any_role(array['Tecnico']) and exists (
          select 1
          from public.checks ch
          where ch.equipment_id = e.id
            and ch.company_id = e.company_id
            and ch.deleted_at is null
            and (
              ch.technician_id = public.current_profile_id()
              or exists (
                select 1 from public.work_order_assignments woa
                where woa.work_order_id = ch.work_order_id
                  and woa.company_id = e.company_id
                  and woa.technician_id = public.current_profile_id()
                  and woa.deleted_at is null
                  and woa.status not in ('Cancelado','Descargado')
              )
            )
        ))
        or (public.has_any_role(array['Tecnico']) and exists (
          select 1
          from public.work_order_equipment woe
          join public.work_orders wo on wo.id = woe.work_order_id
          where woe.equipment_id = e.id
            and woe.company_id = e.company_id
            and wo.company_id = e.company_id
            and wo.deleted_at is null
            and exists (
              select 1 from public.work_order_assignments woa
              where woa.work_order_id = wo.id
                and woa.company_id = e.company_id
                and woa.technician_id = public.current_profile_id()
                and woa.deleted_at is null
                and woa.status not in ('Cancelado','Descargado')
            )
        ))
      )
  );
end;
$$;

create policy equipment_photos_select on public.equipment_photos
  for select to authenticated
  using (company_id = public.current_company_id() and public.can_read_equipment_photo(equipment_id));
create policy equipment_photos_insert on public.equipment_photos
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.can_manage_equipment_photo(equipment_id)
    and taken_by = public.current_profile_id()
    and exists (
      select 1 from public.files f
      where f.id = file_id and f.company_id = public.current_company_id()
    )
  );
create policy equipment_photos_update on public.equipment_photos
  for update to authenticated
  using (company_id = public.current_company_id() and public.can_manage_equipment_photo(equipment_id))
  with check (
    company_id = public.current_company_id()
    and public.can_manage_equipment_photo(equipment_id)
    and exists (
      select 1 from public.files f
      where f.id = file_id and f.company_id = public.current_company_id()
    )
  );

-- Extiende solo los helpers existentes. Las policies de 020 permanecen iguales.
create or replace function public.can_read_dmp_storage_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid; v_type text; v_resource_id uuid;
begin
  begin
    v_company_id := public.dmp_storage_company_id(p_name);
    v_type := public.dmp_storage_resource_type(p_name);
    v_resource_id := public.dmp_storage_resource_id(p_name);
  exception when others then return false; end;
  if v_company_id is null or v_resource_id is null or v_company_id <> public.current_company_id() then return false; end if;
  if v_type = 'checks' then
    return exists (select 1 from public.checks ch where ch.id = v_resource_id and ch.company_id = v_company_id and ch.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id, public.current_profile_id())));
  elsif v_type = 'work-orders' then
    return exists (select 1 from public.work_orders wo where wo.id = v_resource_id and wo.company_id = v_company_id and wo.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or public.is_assigned_to_work_order(wo.id, public.current_profile_id())));
  elsif v_type = 'equipment' then
    return public.can_read_equipment_photo(v_resource_id);
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
  v_company_id uuid; v_type text; v_resource_id uuid;
begin
  begin
    v_company_id := public.dmp_storage_company_id(p_name);
    v_type := public.dmp_storage_resource_type(p_name);
    v_resource_id := public.dmp_storage_resource_id(p_name);
  exception when others then return false; end;
  if v_company_id is null or v_resource_id is null or v_company_id <> public.current_company_id() then return false; end if;
  if v_type = 'checks' then
    return exists (select 1 from public.checks ch where ch.id = v_resource_id and ch.company_id = v_company_id and ch.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia']) or ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order(ch.work_order_id, public.current_profile_id())));
  elsif v_type = 'work-orders' then
    return exists (select 1 from public.work_orders wo where wo.id = v_resource_id and wo.company_id = v_company_id and wo.deleted_at is null and (public.has_any_role(array['superadmin','SAT','Gerencia']) or public.is_assigned_to_work_order(wo.id, public.current_profile_id())));
  elsif v_type = 'equipment' then
    return public.can_manage_equipment_photo(v_resource_id);
  end if;
  return false;
end;
$$;

create or replace function public.dmp_register_equipment_photo(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_equipment public.equipment;
  v_path text := nullif(p_payload->>'path', '');
  v_file_id uuid; v_photo_id uuid; v_mime text; v_size bigint;
  v_storage_metadata jsonb;
begin
  if v_profile_id is null then raise exception 'Sesion no valida'; end if;
  select * into v_equipment from public.equipment where id = (p_payload->>'equipment_id')::uuid and deleted_at is null for update;
  if v_equipment.id is null or not public.can_manage_equipment_photo(v_equipment.id) then raise exception 'No tienes permisos para adjuntar fotos a este equipo'; end if;
  if p_payload->>'bucket' <> 'dmp-files' or v_path is null or v_path not like v_equipment.company_id::text || '/equipment/' || v_equipment.id::text || '/%' then raise exception 'Ruta de Storage no valida para el equipo'; end if;

  select so.metadata into v_storage_metadata
  from storage.objects so
  where so.bucket_id = 'dmp-files' and so.name = v_path and so.owner = auth.uid();
  if not found then raise exception 'El objeto de Storage no existe o no pertenece al usuario autenticado'; end if;
  v_mime := coalesce(nullif(v_storage_metadata->>'mimetype',''), nullif(p_payload->>'mime_type',''));
  v_size := case when coalesce(v_storage_metadata->>'size','') ~ '^[0-9]+$' then (v_storage_metadata->>'size')::bigint else nullif(p_payload->>'size_bytes','')::bigint end;
  if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'MIME de imagen no valido'; end if;
  if v_size is null or v_size < 0 or v_size > 10485760 then raise exception 'Tamano de imagen no valido'; end if;

  insert into public.files(company_id, bucket, path, name, mime_type, size_bytes, uploaded_by, metadata)
  values (v_equipment.company_id, 'dmp-files', v_path, coalesce(nullif(p_payload->>'name',''), v_path), v_mime, v_size, v_profile_id, coalesce(p_payload->'metadata','{}'::jsonb))
  on conflict (bucket, path) do update set mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, uploaded_by = excluded.uploaded_by, metadata = excluded.metadata
  returning id into v_file_id;

  insert into public.equipment_photos(company_id, equipment_id, file_id, taken_by, description, is_primary)
  values (v_equipment.company_id, v_equipment.id, v_file_id, v_profile_id, nullif(p_payload->>'description',''), false)
  returning id into v_photo_id;
  if coalesce((p_payload->>'is_primary')::boolean, true) then
    update public.equipment_photos set is_primary = false where equipment_id = v_equipment.id and id <> v_photo_id and is_primary;
    update public.equipment_photos set is_primary = true where id = v_photo_id;
  end if;
  return v_photo_id;
end;
$$;

create or replace function public.dmp_set_equipment_primary_photo(p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_equipment public.equipment;
begin
  select e.* into v_equipment
  from public.equipment_photos ep
  join public.equipment e on e.id = ep.equipment_id
  where ep.id = p_photo_id
  for update of e;
  if v_equipment.id is null or not public.can_manage_equipment_photo(v_equipment.id) then raise exception 'No tienes permisos para cambiar la foto principal'; end if;
  update public.equipment_photos set is_primary = false where equipment_id = v_equipment.id and is_primary;
  update public.equipment_photos set is_primary = true where id = p_photo_id;
end;
$$;

revoke all on function public.dmp_register_equipment_photo(jsonb) from public;
revoke all on function public.dmp_set_equipment_primary_photo(uuid) from public;
revoke all on function public.can_read_equipment_photo(uuid) from public;
revoke all on function public.can_manage_equipment_photo(uuid) from public;
grant execute on function public.dmp_register_equipment_photo(jsonb) to authenticated;
grant execute on function public.dmp_set_equipment_primary_photo(uuid) to authenticated;
grant execute on function public.can_read_equipment_photo(uuid) to authenticated;
grant execute on function public.can_manage_equipment_photo(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
