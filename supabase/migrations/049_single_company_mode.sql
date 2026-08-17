-- DoorManager Pro - modo de empresa unica por instalacion.
-- No elimina empresas ni reasigna historicos. Mantiene company_id, RLS y RBAC.

begin;

alter table public.companies add column if not exists trade_name text;
alter table public.companies add column if not exists address text;
alter table public.companies add column if not exists postal_code text;
alter table public.companies add column if not exists city text;
alter table public.companies add column if not exists province text;
alter table public.companies add column if not exists country text not null default 'Espana';
alter table public.companies add column if not exists website text;
alter table public.companies add column if not exists logo_url text;
alter table public.companies add column if not exists fiscal_notes text;

create or replace function public.dmp_operating_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_count integer;
begin
  select count(*), min(id)
    into v_count, v_company_id
  from public.companies
  where active = true
    and deleted_at is null;

  if v_count = 1 then
    return v_company_id;
  end if;

  if v_count = 0 then
    raise exception 'No hay una empresa operadora activa configurada';
  end if;

  raise exception 'Hay varias empresas activas. Revisa dmp_single_company_audit antes de activar el modo de empresa unica';
end;
$$;

grant execute on function public.dmp_operating_company_id() to authenticated;

create or replace view public.dmp_single_company_audit
with (security_invoker = true)
as
select
  c.id as company_id,
  c.name,
  c.tax_id,
  c.active,
  c.deleted_at,
  (select count(*) from public.profiles p where p.company_id = c.id) as profiles,
  (select count(*) from public.clients x where x.company_id = c.id) as clients,
  (select count(*) from public.sites x where x.company_id = c.id) as sites,
  (select count(*) from public.equipment x where x.company_id = c.id) as equipment,
  (select count(*) from public.quotes x where x.company_id = c.id) as quotes,
  (select count(*) from public.work_orders x where x.company_id = c.id) as work_orders,
  (select count(*) from public.checks x where x.company_id = c.id) as checks,
  (select count(*) from public.materials x where x.company_id = c.id) as materials,
  (select count(*) from public.stock_movements x where x.company_id = c.id) as stock_movements,
  (select count(*) from public.technician_hour_rates x where x.company_id = c.id) as technician_hour_rates,
  (select count(*) from public.audit_log x where x.company_id = c.id) as audit_events
from public.companies c
order by c.active desc, c.deleted_at nulls first, c.name;

grant select on public.dmp_single_company_audit to authenticated;

create or replace function public.superadmin_global_overview(p_company_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid := coalesce(p_company_id, public.dmp_operating_company_id());
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para consultar el panel de administración';
  end if;

  return jsonb_build_object(
    'companies', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.name), '[]'::jsonb)
      from public.companies c
      where c.id = v_company_id
    ),
    'profiles', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
      from public.profiles p
      where p.deleted_at is null and p.company_id = v_company_id
    ),
    'clients', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
      from public.clients c
      where c.deleted_at is null and c.company_id = v_company_id
    ),
    'sites', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from public.sites s
      where s.deleted_at is null and s.company_id = v_company_id
    ),
    'equipment', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
      from public.equipment e
      where e.deleted_at is null and e.company_id = v_company_id
    ),
    'work_orders', (
      select coalesce(jsonb_agg(to_jsonb(w) order by w.created_at desc), '[]'::jsonb)
      from public.work_orders w
      where w.deleted_at is null and w.company_id = v_company_id
    ),
    'checks', (
      select coalesce(jsonb_agg(to_jsonb(ch) order by ch.created_at desc), '[]'::jsonb)
      from public.checks ch
      where ch.deleted_at is null and ch.company_id = v_company_id
    ),
    'activity', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
      from (select * from public.activity_log al where al.company_id = v_company_id order by al.created_at desc limit 50) a
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.changed_at desc), '[]'::jsonb)
      from (select * from public.audit_log au where au.company_id = v_company_id order by au.changed_at desc limit 100) a
    )
  );
end;
$$;

grant execute on function public.superadmin_global_overview(uuid) to authenticated;

create or replace function public.superadmin_save_profile_with_roles(
  p_profile_id uuid default null,
  p_profile jsonb default '{}'::jsonb,
  p_role_names text[] default array[]::text[]
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_company_id uuid := coalesce(nullif(p_profile->>'company_id', '')::uuid, public.dmp_operating_company_id());
  v_roles text[] := case
    when array_length(p_role_names, 1) is null
      then array[coalesce(nullif(p_profile->>'primary_area', ''), 'SAT')]
    else p_role_names
  end;
  v_role_count integer;
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;
  if not exists (select 1 from public.companies where id = v_company_id and active = true and deleted_at is null) then
    raise exception 'La empresa operadora no existe o está inactiva';
  end if;
  if exists (select 1 from unnest(v_roles) role_name where role_name not in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')) then
    raise exception 'Rol no válido';
  end if;
  if coalesce(array_length(v_roles, 1), 0) = 0 then
    raise exception 'Debe indicar al menos un rol';
  end if;

  if p_profile_id is null then
    insert into public.profiles(company_id, auth_user_id, first_name, last_name, email, phone, primary_area, active)
    values (v_company_id, nullif(p_profile->>'auth_user_id', '')::uuid, nullif(p_profile->>'first_name', ''), nullif(p_profile->>'last_name', ''), lower(nullif(p_profile->>'email', '')), nullif(p_profile->>'phone', ''), coalesce(nullif(p_profile->>'primary_area', ''), 'SAT'), coalesce((p_profile->>'active')::boolean, true))
    returning * into v_profile;
  else
    update public.profiles
    set first_name = coalesce(nullif(p_profile->>'first_name', ''), first_name),
        last_name = coalesce(nullif(p_profile->>'last_name', ''), last_name),
        email = coalesce(lower(nullif(p_profile->>'email', '')), email),
        phone = case when p_profile ? 'phone' then nullif(p_profile->>'phone', '') else phone end,
        auth_user_id = case when p_profile ? 'auth_user_id' then nullif(p_profile->>'auth_user_id', '')::uuid else auth_user_id end,
        primary_area = coalesce(nullif(p_profile->>'primary_area', ''), primary_area),
        active = coalesce((p_profile->>'active')::boolean, active),
        deleted_at = case when p_profile ? 'deleted_at' then nullif(p_profile->>'deleted_at', '')::timestamptz else deleted_at end
    where id = p_profile_id
    returning * into v_profile;
  end if;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  select count(*) into v_role_count from public.roles where name = any(v_roles);
  if v_role_count <> array_length(v_roles, 1) then raise exception 'Alguno de los roles no existe'; end if;

  delete from public.profile_roles where profile_id = v_profile.id;
  insert into public.profile_roles(profile_id, role_id)
  select v_profile.id, r.id from public.roles r where r.name = any(v_roles);

  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_profile.company_id, public.current_profile_id(), 'modificacion', 'profiles', v_profile.id, 'Perfil y roles guardados por administración');

  return v_profile;
end;
$$;

grant execute on function public.superadmin_save_profile_with_roles(uuid, jsonb, text[]) to authenticated;

commit;
