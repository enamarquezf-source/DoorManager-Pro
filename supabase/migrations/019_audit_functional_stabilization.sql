-- Auditoria funcional: estabilizacion de roles SAT/Comercial, avisos y RPC superadmin.
-- Idempotente y sin datos simulados. No elimina perfiles comerciales puros.

begin;

create or replace function public.normalize_profile_role_names(
  p_primary_area text,
  p_role_names text[]
)
returns text[]
language sql
immutable
as $$
  with role_order(name, ord) as (
    values ('superadmin', 1), ('Gerencia', 2), ('SAT', 3), ('Comercial', 4), ('Oficina', 5), ('Tecnico', 6)
  ), requested as (
    select unnest(array_prepend(nullif(p_primary_area, ''), coalesce(p_role_names, array[]::text[]))) as name
  ), cleaned as (
    select distinct ro.name, ro.ord
    from requested req
    join role_order ro on ro.name = req.name
  ), without_comercial_when_sat as (
    select name, ord
    from cleaned
    where not (name = 'Comercial' and exists (select 1 from cleaned where name = 'SAT'))
  )
  select coalesce(array_agg(name order by ord), array[]::text[])
  from without_comercial_when_sat
$$;

delete from public.profile_roles pr
using public.roles comercial, public.roles sat
where pr.role_id = comercial.id
  and comercial.name = 'Comercial'
  and sat.name = 'SAT'
  and exists (
    select 1
    from public.profile_roles sat_pr
    where sat_pr.profile_id = pr.profile_id
      and sat_pr.role_id = sat.id
  );

update public.profiles p
set primary_area = 'SAT',
    updated_at = now()
where exists (
  select 1
  from public.profile_roles pr
  join public.roles r on r.id = pr.role_id
  where pr.profile_id = p.id
    and r.name = 'SAT'
)
and p.primary_area is distinct from 'SAT';

create or replace function public.superadmin_update_profile(p_profile_id uuid, p_profile jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_current_roles text[];
  v_requested_primary text := nullif(p_profile->>'primary_area', '');
  v_primary_area text;
begin
  if not public.is_platform_superadmin() then
    raise exception 'No tienes permiso para actualizar usuarios';
  end if;

  select coalesce(array_agg(r.name order by r.name), array[]::text[])
  into v_current_roles
  from public.profile_roles pr
  join public.roles r on r.id = pr.role_id
  where pr.profile_id = p_profile_id;

  if v_requested_primary is null then
    select primary_area into v_requested_primary from public.profiles where id = p_profile_id;
  end if;

  v_current_roles := public.normalize_profile_role_names(v_requested_primary, v_current_roles);
  v_primary_area := case when 'SAT' = any(v_current_roles) then 'SAT' else coalesce(v_requested_primary, v_current_roles[1]) end;

  update public.profiles
  set first_name = case when p_profile ? 'first_name' then nullif(p_profile->>'first_name', '') else first_name end,
      last_name = case when p_profile ? 'last_name' then nullif(p_profile->>'last_name', '') else last_name end,
      email = case when p_profile ? 'email' then lower(nullif(p_profile->>'email', '')) else email end,
      phone = case when p_profile ? 'phone' then nullif(p_profile->>'phone', '') else phone end,
      auth_user_id = case when p_profile ? 'auth_user_id' then nullif(p_profile->>'auth_user_id', '')::uuid else auth_user_id end,
      primary_area = coalesce(v_primary_area, primary_area),
      active = case when p_profile ? 'active' and nullif(p_profile->>'active', '') is not null then (p_profile->>'active')::boolean else active end,
      deleted_at = case when p_profile ? 'deleted_at' then nullif(p_profile->>'deleted_at', '')::timestamptz else deleted_at end
  where id = p_profile_id
  returning * into v_profile;

  if v_profile.id is null then raise exception 'Usuario no encontrado'; end if;

  delete from public.profile_roles pr
  using public.roles comercial, public.roles sat
  where pr.profile_id = p_profile_id
    and pr.role_id = comercial.id
    and comercial.name = 'Comercial'
    and sat.name = 'SAT'
    and exists (
      select 1 from public.profile_roles sat_pr
      where sat_pr.profile_id = p_profile_id and sat_pr.role_id = sat.id
    );

  return v_profile;
end;
$$;

create or replace function public.mark_alert_as_read(
  p_alert_recipient_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_profile uuid := public.current_profile_id();
begin
  if v_current_profile is null or p_profile_id is distinct from v_current_profile then
    raise exception 'No tienes permiso para modificar avisos de otro usuario';
  end if;

  update public.alert_recipients ar
  set is_read = true,
      read_at = now()
  where ar.id = p_alert_recipient_id
    and ar.closed_at is null
    and (
      ar.recipient_profile_id = v_current_profile
      or (
        ar.recipient_profile_id is null
        and ar.recipient_role in (
          select p.primary_area from public.profiles p where p.id = v_current_profile
        )
      )
    );

  if not found then
    raise exception 'Aviso no encontrado o no permitido para este usuario';
  end if;
end;
$$;

drop policy if exists alert_recipients_update_scoped on public.alert_recipients;
create policy alert_recipients_update_scoped on public.alert_recipients
for update to authenticated using (
  public.is_platform_superadmin()
  or public.has_any_role(array['SAT','Gerencia','Oficina'])
  or recipient_profile_id = public.current_profile_id()
  or (
    recipient_profile_id is null
    and recipient_role in (select p.primary_area from public.profiles p where p.id = public.current_profile_id())
  )
) with check (
  public.is_platform_superadmin()
  or public.has_any_role(array['SAT','Gerencia','Oficina'])
  or recipient_profile_id = public.current_profile_id()
  or (
    recipient_profile_id is null
    and recipient_role in (select p.primary_area from public.profiles p where p.id = public.current_profile_id())
  )
);

grant execute on function public.superadmin_update_profile(uuid, jsonb) to authenticated;
grant execute on function public.mark_alert_as_read(uuid, uuid) to authenticated;

commit;
