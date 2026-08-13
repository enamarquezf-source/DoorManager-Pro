-- DoorManager Pro - permisos y ciclo de vida de presupuestos.
-- Idempotente. Mantiene RLS por company_id y auditoria de archivo sin borrado fisico.

begin;

alter table public.quotes add column if not exists deleted_by uuid references public.profiles(id);
alter table public.quotes add column if not exists delete_reason text;
alter table public.quote_lines add column if not exists deleted_by uuid references public.profiles(id);
alter table public.quote_lines add column if not exists delete_reason text;

drop policy if exists quotes_select_commercial on public.quotes;
drop policy if exists quotes_write_commercial on public.quotes;
drop policy if exists quotes_update_commercial on public.quotes;
drop policy if exists quotes_delete_superadmin on public.quotes;
drop policy if exists quotes_select_authorized_roles on public.quotes;
drop policy if exists quotes_insert_authorized_roles on public.quotes;
drop policy if exists quotes_update_authorized_roles on public.quotes;
drop policy if exists quotes_no_physical_delete on public.quotes;

create policy quotes_select_authorized_roles on public.quotes for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quotes_insert_authorized_roles on public.quotes for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quotes_update_authorized_roles on public.quotes for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quotes_no_physical_delete on public.quotes for delete to authenticated using (false);

drop policy if exists quote_lines_select_commercial on public.quote_lines;
drop policy if exists quote_lines_insert_commercial on public.quote_lines;
drop policy if exists quote_lines_update_commercial on public.quote_lines;
drop policy if exists quote_lines_delete_superadmin on public.quote_lines;
drop policy if exists quote_lines_select_authorized_roles on public.quote_lines;
drop policy if exists quote_lines_insert_authorized_roles on public.quote_lines;
drop policy if exists quote_lines_update_authorized_roles on public.quote_lines;
drop policy if exists quote_lines_no_physical_delete on public.quote_lines;

create policy quote_lines_select_authorized_roles on public.quote_lines for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quote_lines_insert_authorized_roles on public.quote_lines for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quote_lines_update_authorized_roles on public.quote_lines for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']));
create policy quote_lines_no_physical_delete on public.quote_lines for delete to authenticated using (false);

create or replace function public.dmp_lifecycle_allowed_entities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['clients','sites','equipment','cases','work_orders','checks','check_templates','profiles','quotes']::text[];
$$;

create or replace function public.dmp_lifecycle_target_company(p_entity text, p_entity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_entity <> all(public.dmp_lifecycle_allowed_entities()) then
    raise exception 'Entidad no permitida para gestion de ciclo de vida: %', p_entity;
  end if;

  if p_entity = 'clients' then
    select company_id into v_company_id from public.clients where id = p_entity_id;
  elsif p_entity = 'sites' then
    select company_id into v_company_id from public.sites where id = p_entity_id;
  elsif p_entity = 'equipment' then
    select company_id into v_company_id from public.equipment where id = p_entity_id;
  elsif p_entity = 'cases' then
    select company_id into v_company_id from public.cases where id = p_entity_id;
  elsif p_entity = 'work_orders' then
    select company_id into v_company_id from public.work_orders where id = p_entity_id;
  elsif p_entity = 'checks' then
    select company_id into v_company_id from public.checks where id = p_entity_id;
  elsif p_entity = 'check_templates' then
    select company_id into v_company_id from public.check_templates where id = p_entity_id;
  elsif p_entity = 'profiles' then
    select company_id into v_company_id from public.profiles where id = p_entity_id;
  elsif p_entity = 'quotes' then
    select company_id into v_company_id from public.quotes where id = p_entity_id;
  end if;

  if v_company_id is null then
    raise exception 'Registro no encontrado o sin empresa asociada';
  end if;
  return v_company_id;
end;
$$;

create or replace function public.dmp_assert_lifecycle_actor(p_company_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Operacion no permitida para usuarios anonimos';
  end if;

  select * into v_profile
  from public.profiles
  where id = public.current_profile_id()
    and auth_user_id = auth.uid()
    and active = true
    and deleted_at is null;

  if v_profile.id is null then
    raise exception 'Perfil no encontrado o inactivo';
  end if;

  perform public.assert_member_of_current_company(p_company_id);

  if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then
    raise exception 'No tienes permisos para archivar, restaurar o eliminar registros';
  end if;

  return v_profile;
end;
$$;

create or replace function public.dmp_archive_quote(p_quote_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.dmp_lifecycle_target_company('quotes', p_quote_id);
  v_actor public.profiles := public.dmp_assert_lifecycle_actor(v_company_id);
  v_old jsonb;
  v_new jsonb;
begin
  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  select to_jsonb(t) into v_old from public.quotes t where id = p_quote_id for update;
  if v_old->>'deleted_at' is not null then raise exception 'El presupuesto ya está archivado'; end if;
  update public.quotes
  set deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), updated_by = v_actor.id, updated_at = now()
  where id = p_quote_id
  returning to_jsonb(quotes.*) into v_new;
  update public.quote_lines
  set deleted_at = coalesce(deleted_at, now()), deleted_by = v_actor.id, delete_reason = trim(p_reason), updated_at = now()
  where quote_id = p_quote_id and deleted_at is null;
  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, 'quotes', p_quote_id, 'SOFT_DELETE', p_reason, v_old, v_new);
  return jsonb_build_object('entity', 'quotes', 'id', p_quote_id, 'company_id', v_company_id, 'archived', true, 'operation', 'archived');
end;
$$;

create or replace function public.dmp_archive_entity(p_entity text, p_entity_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor public.profiles;
  v_target_profile public.profiles;
  v_old jsonb;
  v_new jsonb;
begin
  if p_entity = 'quotes' then
    return public.dmp_archive_quote(p_entity_id, p_reason);
  end if;

  if trim(coalesce(p_reason, '')) = '' then raise exception 'El motivo es obligatorio'; end if;
  v_company_id := public.dmp_lifecycle_target_company(p_entity, p_entity_id);
  v_actor := public.dmp_assert_lifecycle_actor(v_company_id);

  if p_entity = 'clients' then
    select to_jsonb(t) into v_old from public.clients t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.clients set deleted_at = coalesce(deleted_at, now()), status = case when status = 'Activo' then 'Inactivo' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(clients.*) into v_new;
  elsif p_entity = 'sites' then
    select to_jsonb(t) into v_old from public.sites t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.sites set deleted_at = coalesce(deleted_at, now()), active = false, updated_at = now() where id = p_entity_id returning to_jsonb(sites.*) into v_new;
  elsif p_entity = 'equipment' then
    select to_jsonb(t) into v_old from public.equipment t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.equipment set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Operativo','Pendiente de revision') then 'Fuera de servicio' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(equipment.*) into v_new;
  elsif p_entity = 'cases' then
    select to_jsonb(t) into v_old from public.cases t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.cases set deleted_at = coalesce(deleted_at, now()), status = case when status in ('Abierto','En curso','Pendiente') then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(cases.*) into v_new;
  elsif p_entity = 'work_orders' then
    select to_jsonb(t) into v_old from public.work_orders t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.work_orders set deleted_at = coalesce(deleted_at, now()), status = case when status not in ('Cerrado','Cancelado') then 'Cancelado' else status end, updated_by = v_actor.id, updated_at = now() where id = p_entity_id returning to_jsonb(work_orders.*) into v_new;
    insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values (v_company_id, p_entity_id, v_old->>'status', v_new->>'status', v_actor.id, p_reason, true);
  elsif p_entity = 'checks' then
    select to_jsonb(t) into v_old from public.checks t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;
    update public.checks set deleted_at = coalesce(deleted_at, now()), status = case when status <> 'Realizado' then 'Cancelado' else status end, updated_at = now() where id = p_entity_id returning to_jsonb(checks.*) into v_new;
  elsif p_entity = 'check_templates' then
    select to_jsonb(t) into v_old from public.check_templates t where id = p_entity_id for update;
    if coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;
    update public.check_templates set active = false, updated_at = now() where id = p_entity_id returning to_jsonb(check_templates.*) into v_new;
  elsif p_entity = 'profiles' then
    v_target_profile := public.dmp_assert_profile_lifecycle_target(p_entity_id, v_actor, 'archive');
    select to_jsonb(t) into v_old from public.profiles t where id = p_entity_id for update;
    if v_old->>'deleted_at' is not null or coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;
    update public.profiles set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now() where id = p_entity_id returning to_jsonb(profiles.*) into v_new;
  end if;

  perform public.dmp_record_lifecycle_audit(v_company_id, v_actor, p_entity, p_entity_id, 'SOFT_DELETE', p_reason, v_old, v_new);
  return public.dmp_lifecycle_dependencies(p_entity, p_entity_id) || jsonb_build_object('operation', 'archived');
end;
$$;

revoke all on function public.dmp_archive_quote(uuid, text) from public;
grant execute on function public.dmp_archive_quote(uuid, text) to authenticated;

commit;
