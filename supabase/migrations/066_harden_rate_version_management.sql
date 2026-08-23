-- DoorManager Pro 066 - versionado atomico y proteccion de tarifas operativas.
-- No recalcula snapshots: solo cierra vigencias y crea nuevas versiones.

begin;

create or replace function public.dmp_create_rate_catalog(p_payload jsonb)
returns public.rate_catalog
language plpgsql
security definer
set search_path = public
as $$
declare v_actor public.profiles := public.dmp_active_profile(); v_row public.rate_catalog;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: solo Gerencia puede crear conceptos'; end if;
  insert into public.rate_catalog(company_id,code,name,kind,classification,unit,billing_mode,period_days,contributes_to_sale,active,notes,created_by,updated_by)
  values(public.current_company_id(),nullif(trim(p_payload->>'code'),''),nullif(trim(p_payload->>'name'),''),coalesce(nullif(p_payload->>'kind',''),'cost'),coalesce(nullif(p_payload->>'classification',''),nullif(p_payload->>'kind',''),'cost'),coalesce(nullif(p_payload->>'unit',''),'ud'),coalesce(nullif(p_payload->>'billing_mode',''),'unit'),nullif(p_payload->>'period_days','')::integer,coalesce((p_payload->>'contributes_to_sale')::boolean,false),true,nullif(p_payload->>'notes',''),v_actor.id,v_actor.id)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.dmp_update_rate_catalog(p_catalog_id uuid, p_payload jsonb)
returns public.rate_catalog
language plpgsql
security definer
set search_path = public
as $$
declare v_actor public.profiles := public.dmp_active_profile(); v_row public.rate_catalog;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: solo Gerencia puede editar conceptos'; end if;
  update public.rate_catalog set kind=coalesce(nullif(p_payload->>'kind',''),kind), classification=coalesce(nullif(p_payload->>'classification',''),classification), unit=coalesce(nullif(p_payload->>'unit',''),unit), billing_mode=coalesce(nullif(p_payload->>'billing_mode',''),billing_mode), period_days=case when p_payload ? 'period_days' then nullif(p_payload->>'period_days','')::integer else period_days end, contributes_to_sale=case when p_payload ? 'contributes_to_sale' then (p_payload->>'contributes_to_sale')::boolean else contributes_to_sale end, notes=case when p_payload ? 'notes' then nullif(p_payload->>'notes','') else notes end, updated_by=v_actor.id, updated_at=now()
  where id=p_catalog_id and company_id=public.current_company_id() and deleted_at is null returning * into v_row;
  if v_row.id is null then raise exception 'concepto: inexistente o fuera de la empresa'; end if;
  return v_row;
end;
$$;

create or replace function public.dmp_archive_rate_catalog(p_catalog_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_actor public.profiles := public.dmp_active_profile(); v_id uuid;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: solo Gerencia puede archivar conceptos'; end if;
  update public.rate_catalog set active=false, deleted_at=now(), updated_by=v_actor.id, updated_at=now()
  where id=p_catalog_id and company_id=public.current_company_id();
  if not found then raise exception 'concepto: inexistente o fuera de la empresa'; end if;
  return p_catalog_id;
end;
$$;

create or replace function public.dmp_rate_version_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and old.deleted_at is null and (not new.active or new.deleted_at is not null)
     and exists (select 1 from public.rate_catalog c where c.id = old.rate_id and c.code in ('tecnico','desplazamiento','grua','pemp'))
      and ((old.valid_from <= current_date and (old.valid_to is null or old.valid_to >= current_date) and not exists (
        select 1 from public.rate_versions v
        where v.rate_id = old.rate_id and v.company_id = old.company_id and v.id <> old.id
          and v.active and v.deleted_at is null and v.valid_from <= current_date
          and (v.valid_to is null or v.valid_to >= current_date)
      )) or (old.valid_from > current_date and not exists (
        select 1 from public.rate_versions v
        where v.rate_id = old.rate_id and v.company_id = old.company_id and v.id <> old.id
          and v.active and v.deleted_at is null and v.valid_from <= old.valid_from
          and (v.valid_to is null or v.valid_to >= old.valid_from)
      ))) then
    raise exception 'tarifa: no se puede archivar la unica version operativa vigente del concepto canonico; crea una nueva version primero';
  end if;
  return new;
end;
$$;

drop trigger if exists rate_version_lifecycle_guard on public.rate_versions;
create trigger rate_version_lifecycle_guard
before update on public.rate_versions
for each row execute function public.dmp_rate_version_lifecycle_guard();

create or replace function public.dmp_rate_catalog_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and old.deleted_at is null and (not new.active or new.deleted_at is not null)
     and old.code in ('tecnico','desplazamiento','grua','pemp') then
    raise exception 'concepto: no se puede archivar un concepto canonico operativo desde Gerencia';
  end if;
  return new;
end;
$$;

drop trigger if exists rate_catalog_lifecycle_guard on public.rate_catalog;
create trigger rate_catalog_lifecycle_guard
before update on public.rate_catalog
for each row execute function public.dmp_rate_catalog_lifecycle_guard();

create or replace function public.dmp_create_rate_version(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp_active_profile();
  v_company_id uuid := public.current_company_id();
  v_rate_id uuid := nullif(p_payload->>'rate_id','')::uuid;
  v_from date := coalesce(nullif(p_payload->>'valid_from','')::date, current_date);
  v_cost numeric := coalesce(nullif(p_payload->>'cost_amount','')::numeric, 0);
  v_sale numeric := coalesce(nullif(p_payload->>'sale_amount','')::numeric, 0);
  v_profile uuid := nullif(p_payload->>'technician_profile_id','')::uuid;
  v_previous public.rate_versions;
  v_id uuid;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: solo Gerencia puede versionar tarifas'; end if;
  if v_rate_id is null or not exists (select 1 from public.rate_catalog c where c.id=v_rate_id and c.company_id=v_company_id and c.active and c.deleted_at is null) then
    raise exception 'tarifa: concepto inexistente, archivado o fuera de la empresa';
  end if;
  if v_cost < 0 or v_sale < 0 then raise exception 'tarifa: coste y venta no pueden ser negativos'; end if;
  if v_from < current_date and not exists (select 1 from public.rate_versions v where v.rate_id=v_rate_id and v.valid_from=v_from) then
    raise exception 'tarifa: no se puede crear una version nueva con fecha historica';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',v_company_id::text,v_rate_id::text,coalesce(v_profile,'00000000-0000-0000-0000-000000000000')::text),0));
  if exists (select 1 from public.rate_versions v where v.company_id=v_company_id and v.rate_id=v_rate_id and v.technician_profile_id is not distinct from v_profile and v.active and v.deleted_at is null and daterange(v.valid_from,coalesce(v.valid_to,'9999-12-31'::date),'[]') && daterange(v_from,coalesce(nullif(p_payload->>'valid_to','')::date,'9999-12-31'::date),'[]')) then
    raise exception 'tarifa: la nueva version se solapa con otra version activa';
  end if;

  select v.* into v_previous from public.rate_versions v
  where v.company_id=v_company_id and v.rate_id=v_rate_id and v.technician_profile_id is not distinct from v_profile
    and v.active and v.deleted_at is null and v.valid_from < v_from
    and (v.valid_to is null or v.valid_to >= v_from)
  order by v.valid_from desc for update;
  if v_previous.id is not null then
    update public.rate_versions set valid_to=v_from-1, updated_by=v_actor.id, updated_at=now() where id=v_previous.id;
  elsif exists (select 1 from public.rate_catalog c where c.id=v_rate_id and c.code in ('tecnico','desplazamiento','grua','pemp'))
    and exists (select 1 from public.rate_versions v where v.company_id=v_company_id and v.rate_id=v_rate_id and v.technician_profile_id is not distinct from v_profile and v.active and v.deleted_at is null and v.valid_from < v_from)
    and not exists (select 1 from public.rate_versions v where v.company_id=v_company_id and v.rate_id=v_rate_id and v.technician_profile_id is not distinct from v_profile and v.active and v.deleted_at is null and v.valid_to >= v_from-1) then
    raise exception 'tarifa: el cambio dejaria un hueco sin tarifa aplicable';
  elsif v_from > current_date and exists (select 1 from public.rate_catalog c where c.id=v_rate_id and c.code in ('tecnico','desplazamiento','grua','pemp')) then
    raise exception 'tarifa: una primera version operativa debe comenzar hoy o antes';
  end if;

  if nullif(p_payload->>'valid_to','') is not null and nullif(p_payload->>'valid_to','')::date < v_from then raise exception 'tarifa: valid_to no puede ser anterior a valid_from'; end if;
  if exists (select 1 from public.rate_catalog c where c.id=v_rate_id and c.code in ('tecnico','desplazamiento','grua','pemp')) and exists (select 1 from public.rate_versions v where v.company_id=v_company_id and v.rate_id=v_rate_id and v.technician_profile_id is not distinct from v_profile and v.active and v.deleted_at is null and v.valid_from > coalesce(nullif(p_payload->>'valid_to','')::date,'9999-12-31'::date)+1) then
    raise exception 'tarifa: el cambio dejaria un hueco sin tarifa aplicable';
  end if;
  insert into public.rate_versions(company_id,rate_id,technician_profile_id,category,cost_amount,sale_amount,valid_from,valid_to,active,notes,created_by,updated_by)
  values(v_company_id,v_rate_id,v_profile,nullif(p_payload->>'category',''),v_cost,v_sale,v_from,nullif(p_payload->>'valid_to','')::date,true,nullif(p_payload->>'notes',''),v_actor.id,v_actor.id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dmp_archive_rate_version(p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_actor public.profiles := public.dmp_active_profile(); v_company_id uuid := public.current_company_id();
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then raise exception 'permiso: solo Gerencia puede archivar tarifas'; end if;
  update public.rate_versions set active=false, deleted_at=now(), updated_by=v_actor.id, updated_at=now()
  where id=p_version_id and company_id=v_company_id;
  if not found then raise exception 'tarifa: version inexistente o fuera de la empresa'; end if;
  return p_version_id;
end;
$$;

revoke all on function public.dmp_create_rate_version(jsonb) from public, anon;
grant execute on function public.dmp_create_rate_version(jsonb) to authenticated;
revoke all on function public.dmp_create_rate_catalog(jsonb) from public, anon;
grant execute on function public.dmp_create_rate_catalog(jsonb) to authenticated;
revoke all on function public.dmp_update_rate_catalog(uuid,jsonb) from public, anon;
grant execute on function public.dmp_update_rate_catalog(uuid,jsonb) to authenticated;
revoke all on function public.dmp_archive_rate_catalog(uuid) from public, anon;
grant execute on function public.dmp_archive_rate_catalog(uuid) to authenticated;
revoke all on function public.dmp_archive_rate_version(uuid) from public, anon;
grant execute on function public.dmp_archive_rate_version(uuid) to authenticated;

commit;
