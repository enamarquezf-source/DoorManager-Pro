begin;

alter table public.equipment_photos add column if not exists deleted_at timestamptz;

create or replace function public.dmp_archive_equipment_photo(p_photo_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  equipment_id_found uuid;
  was_primary boolean;
begin
  if not coalesce(public.has_any_role(array['SAT', 'superadmin']), false) then
    raise exception 'permiso: solo SAT o Superadmin pueden borrar fotos de equipos';
  end if;

  select e.id into equipment_id_found
  from public.equipment_photos photo
  join public.equipment e on e.id = photo.equipment_id and e.company_id = photo.company_id
  where photo.id = p_photo_id and e.company_id = public.current_company_id() and e.deleted_at is null
  for update of e;

  if equipment_id_found is null then
    raise exception 'permiso: la foto no está disponible en esta empresa';
  end if;

  select is_primary into was_primary from public.equipment_photos where id = p_photo_id and deleted_at is null;
  update public.equipment_photos
  set deleted_at = now(), is_primary = false
  where id = p_photo_id and deleted_at is null;

  if was_primary then
    update public.equipment_photos set is_primary = true
    where id = (select id from public.equipment_photos
      where equipment_id = equipment_id_found and deleted_at is null
      order by taken_at desc nulls last, id limit 1);
  end if;
end;
$$;

revoke all on function public.dmp_archive_equipment_photo(uuid) from public, anon;
grant execute on function public.dmp_archive_equipment_photo(uuid) to authenticated;

create or replace function public.dmp_set_equipment_primary_photo(p_photo_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare equipment_id_found uuid;
begin
  select e.id into equipment_id_found
  from public.equipment_photos photo
  join public.equipment e on e.id = photo.equipment_id and e.company_id = photo.company_id
  where photo.id = p_photo_id and photo.deleted_at is null
  for update of e;

  if equipment_id_found is null or not public.can_manage_equipment_photo(equipment_id_found)
    or not exists (select 1 from public.equipment_photos where id = p_photo_id and deleted_at is null) then
    raise exception 'permiso: no tienes permisos para cambiar la foto principal o la foto ya no está disponible';
  end if;

  update public.equipment_photos set is_primary = false where equipment_id = equipment_id_found and is_primary;
  update public.equipment_photos set is_primary = true where id = p_photo_id;
end;
$$;

drop policy if exists equipment_photos_select on public.equipment_photos;
create policy equipment_photos_select on public.equipment_photos for select to authenticated
  using (deleted_at is null and company_id = public.current_company_id() and public.can_read_equipment_photo(equipment_id));

drop policy if exists equipment_photos_update on public.equipment_photos;
create policy equipment_photos_update on public.equipment_photos for update to authenticated
  using (deleted_at is null and company_id = public.current_company_id() and public.can_manage_equipment_photo(equipment_id))
  with check (deleted_at is null and company_id = public.current_company_id() and public.can_manage_equipment_photo(equipment_id)
    and exists (select 1 from public.files f where f.id = file_id and f.company_id = public.current_company_id()));

create or replace function public.dmp_guard_technician_check_structure()
returns trigger language plpgsql set search_path = public
as $$
begin
  if public.has_any_role(array['Tecnico']) and not public.has_any_role(array['SAT','superadmin'])
    and (new.work_order_id, new.equipment_id, new.template_id, new.technician_id, new.company_id, new.code, new.deleted_at)
      is distinct from (old.work_order_id, old.equipment_id, old.template_id, old.technician_id, old.company_id, old.code, old.deleted_at) then
    raise exception 'permiso: el técnico puede rellenar el check, pero no cambiar su configuración';
  end if;
  return new;
end;
$$;

drop trigger if exists dmp_guard_technician_check_structure on public.checks;
create trigger dmp_guard_technician_check_structure before update on public.checks
  for each row execute function public.dmp_guard_technician_check_structure();

notify pgrst, 'reload schema';
commit;
