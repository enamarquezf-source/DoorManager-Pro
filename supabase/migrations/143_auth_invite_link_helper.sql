-- DoorManager Pro - AUTH-1 durable invite intent and atomic link helpers.
-- Auth Admin remains in the Edge Function; these helpers never create Auth users.
begin;

create table if not exists public.auth_invite_intents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id),
  company_id uuid not null references public.companies(id),
  email text not null,
  state text not null default 'pending' check (state in ('pending','invited','linked')),
  auth_user_id uuid,
  operation_id uuid,
  lease_expires_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_invite_intents_email_normalized check (email = lower(trim(email)))
);

create index if not exists auth_invite_intents_company_state_idx
  on public.auth_invite_intents(company_id, state, updated_at desc);
create unique index if not exists auth_invite_intents_auth_user_unique
  on public.auth_invite_intents(auth_user_id)
  where auth_user_id is not null;

alter table public.auth_invite_intents enable row level security;
revoke all on table public.auth_invite_intents from public, anon, authenticated;

create or replace function public.dmp_auth_invite_actor(p_actor_profile_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_is_superadmin boolean;
  v_is_platform boolean;
begin
  select * into v_actor
  from public.profiles
  where id = p_actor_profile_id and active and deleted_at is null;
  select exists (
    select 1 from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = v_actor.id and r.name = 'superadmin'
  ) into v_is_superadmin;
  select exists (select 1 from public.platform_superadmins where profile_id = v_actor.id) into v_is_platform;
  if v_actor.id is null or not v_is_superadmin or v_is_platform then
    raise exception 'seguridad: actor no autorizado';
  end if;
  return v_actor;
end;
$$;

create or replace function public.dmp_admin_reserve_auth_invite(
  p_profile_id uuid,
  p_actor_profile_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_intent public.auth_invite_intents;
  v_email text;
begin
  v_actor := public.dmp_auth_invite_actor(p_actor_profile_id);
  perform pg_advisory_xact_lock(hashtextextended('dmp:auth-invite:' || p_profile_id::text, 0));
  select * into v_target from public.profiles where id = p_profile_id for update;
  if p_operation_id is null then raise exception 'validacion: operation_id requerido'; end if;
  if v_target.id is null or v_target.company_id <> v_actor.company_id or v_target.active = false or v_target.deleted_at is not null then
    raise exception 'seguridad: perfil fuera de alcance';
  end if;
  v_email := lower(trim(coalesce(v_target.email, '')));
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'validacion: el perfil no tiene email valido';
  end if;
  if v_target.auth_user_id is not null then
    return jsonb_build_object('state', 'linked', 'profile_id', v_target.id, 'company_id', v_target.company_id, 'email', v_email, 'auth_user_id', v_target.auth_user_id);
  end if;
  select * into v_intent from public.auth_invite_intents where profile_id = v_target.id for update;
  if v_intent.id is not null then
    if v_intent.company_id <> v_actor.company_id or v_intent.email <> v_email then
      raise exception 'conflicto: el intent Auth no coincide con el perfil actual';
    end if;
    if v_intent.operation_id is not null and coalesce(v_intent.lease_expires_at, now()) > now() then
      return jsonb_build_object('intent_id', v_intent.id, 'profile_id', v_target.id, 'company_id', v_target.company_id, 'email', v_intent.email, 'created_at', v_intent.created_at, 'state', 'busy', 'auth_user_id', v_intent.auth_user_id);
    end if;
    update public.auth_invite_intents set operation_id = p_operation_id, lease_expires_at = now() + interval '5 minutes', updated_at = now() where id = v_intent.id;
    select * into v_intent from public.auth_invite_intents where id = v_intent.id;
    return jsonb_build_object('intent_id', v_intent.id, 'profile_id', v_target.id, 'company_id', v_target.company_id, 'email', v_intent.email, 'created_at', v_intent.created_at, 'state', v_intent.state, 'auth_user_id', v_intent.auth_user_id, 'claim', 'acquired');
  end if;
  insert into public.auth_invite_intents(profile_id, company_id, email, state, created_by, operation_id, lease_expires_at)
  values (v_target.id, v_target.company_id, v_email, 'pending', v_actor.id, p_operation_id, now() + interval '5 minutes')
  returning * into v_intent;
  return jsonb_build_object('intent_id', v_intent.id, 'profile_id', v_target.id, 'company_id', v_target.company_id, 'email', v_intent.email, 'created_at', v_intent.created_at, 'state', v_intent.state, 'auth_user_id', null, 'claim', 'acquired');
end;
$$;

create or replace function public.dmp_admin_record_auth_invite(
  p_intent_id uuid,
  p_auth_user_id uuid,
  p_actor_profile_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_intent public.auth_invite_intents;
  v_existing public.profiles;
begin
  v_actor := public.dmp_auth_invite_actor(p_actor_profile_id);
  select * into v_intent from public.auth_invite_intents where id = p_intent_id for update;
  if v_intent.id is null or v_intent.company_id <> v_actor.company_id then raise exception 'seguridad: intent fuera de alcance'; end if;
  select * into v_target from public.profiles where id = v_intent.profile_id for update;
  if v_target.id is null or v_target.company_id <> v_actor.company_id or v_target.active = false or v_target.deleted_at is not null then raise exception 'seguridad: perfil fuera de alcance'; end if;
  if lower(trim(v_target.email)) <> v_intent.email then raise exception 'conflicto: email del perfil cambiado'; end if;
  if v_intent.operation_id is distinct from p_operation_id or v_intent.lease_expires_at is null or v_intent.lease_expires_at <= now() then raise exception 'conflicto: claim Auth expirado o ajeno'; end if;
  if not exists (select 1 from auth.users u where u.id = p_auth_user_id and lower(u.email) = v_intent.email) then raise exception 'conflicto: identidad Auth no coincide'; end if;
  select * into v_existing from public.profiles where auth_user_id = p_auth_user_id for update;
  if v_existing.id is not null and v_existing.id <> v_intent.profile_id then raise exception 'conflicto: identidad Auth ya vinculada'; end if;
  if v_intent.auth_user_id is not null then
    if v_intent.auth_user_id <> p_auth_user_id then raise exception 'conflicto: intent Auth ya asociado'; end if;
    return jsonb_build_object('status', 'already_recorded', 'intent_id', v_intent.id, 'auth_user_id', v_intent.auth_user_id);
  end if;
  update public.auth_invite_intents set auth_user_id = p_auth_user_id, state = 'invited', updated_at = now() where id = v_intent.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_intent.company_id, 'profiles', v_intent.profile_id, 'UPDATE', v_actor.id, jsonb_build_object('auth_user_id', null), jsonb_build_object('auth_event', 'invite_requested', 'intent_id', v_intent.id, 'auth_user_id', p_auth_user_id));
  return jsonb_build_object('status', 'recorded', 'intent_id', v_intent.id, 'auth_user_id', p_auth_user_id);
end;
$$;

create or replace function public.dmp_admin_release_auth_invite(
  p_intent_id uuid,
  p_operation_id uuid,
  p_actor_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_intent public.auth_invite_intents;
begin
  v_actor := public.dmp_auth_invite_actor(p_actor_profile_id);
  select * into v_intent from public.auth_invite_intents where id = p_intent_id for update;
  if v_intent.id is null or v_intent.company_id <> v_actor.company_id then raise exception 'seguridad: intent fuera de alcance'; end if;
  if v_intent.operation_id = p_operation_id and v_intent.lease_expires_at is not null and v_intent.lease_expires_at > now() then
    update public.auth_invite_intents set state = case when auth_user_id is null then 'pending' else 'invited' end, operation_id = null, lease_expires_at = null, updated_at = now() where id = v_intent.id;
  else
    raise exception 'conflicto: claim Auth expirado o ajeno';
  end if;
end;
$$;

create or replace function public.dmp_admin_finalize_auth_invite(
  p_intent_id uuid,
  p_auth_user_id uuid,
  p_actor_profile_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_intent public.auth_invite_intents;
  v_existing public.profiles;
begin
  v_actor := public.dmp_auth_invite_actor(p_actor_profile_id);
  select * into v_intent from public.auth_invite_intents where id = p_intent_id for update;
  select * into v_target from public.profiles where id = v_intent.profile_id for update;
  if v_target.id is null or v_target.company_id <> v_actor.company_id or v_target.active = false or v_target.deleted_at is not null then raise exception 'seguridad: perfil fuera de alcance'; end if;
  if v_intent.id is null or v_intent.company_id <> v_actor.company_id then raise exception 'conflicto: intent Auth invalido'; end if;
  if v_target.auth_user_id is not null then
    if v_target.auth_user_id = p_auth_user_id then return jsonb_build_object('status', 'already_linked', 'profile_id', v_target.id, 'intent_id', v_intent.id); end if;
    raise exception 'conflicto: perfil ya vinculado';
  end if;
  if v_intent.operation_id is distinct from p_operation_id or v_intent.lease_expires_at is null or v_intent.lease_expires_at <= now() then raise exception 'conflicto: claim Auth expirado o ajeno'; end if;
  if v_intent.auth_user_id is distinct from p_auth_user_id then raise exception 'conflicto: intent Auth invalido'; end if;
  if lower(trim(v_target.email)) <> v_intent.email then raise exception 'conflicto: email del perfil cambiado'; end if;
  if not exists (select 1 from auth.users u where u.id = p_auth_user_id and lower(u.email) = v_intent.email) then raise exception 'conflicto: identidad Auth no coincide'; end if;
  select * into v_existing from public.profiles where auth_user_id = p_auth_user_id for update;
  if v_existing.id is not null and v_existing.id <> v_target.id then raise exception 'conflicto: identidad Auth ya vinculada'; end if;
  update public.profiles set auth_user_id = p_auth_user_id, updated_at = now() where id = v_target.id and auth_user_id is null;
  update public.auth_invite_intents set state = 'linked', operation_id = null, lease_expires_at = null, updated_at = now() where id = v_intent.id;
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (v_target.company_id, 'profiles', v_target.id, 'UPDATE', v_actor.id, jsonb_build_object('auth_user_id', null), jsonb_build_object('auth_event', 'invite_and_link', 'intent_id', v_intent.id, 'auth_user_id', p_auth_user_id));
  return jsonb_build_object('status', 'linked', 'profile_id', v_target.id, 'intent_id', v_intent.id);
end;
$$;

revoke all on function public.dmp_auth_invite_actor(uuid) from public, anon, authenticated;
revoke all on function public.dmp_admin_reserve_auth_invite(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.dmp_admin_record_auth_invite(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.dmp_admin_release_auth_invite(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.dmp_admin_finalize_auth_invite(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.dmp_admin_reserve_auth_invite(uuid, uuid, uuid) to service_role;
grant execute on function public.dmp_admin_record_auth_invite(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.dmp_admin_release_auth_invite(uuid, uuid, uuid) to service_role;
grant execute on function public.dmp_admin_finalize_auth_invite(uuid, uuid, uuid, uuid) to service_role;

commit;
