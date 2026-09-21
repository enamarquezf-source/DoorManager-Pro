-- DoorManager Pro - explicit platform Superadmin membership.
-- Tenant role membership never grants platform scope.
begin;

create table public.platform_superadmins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.platform_superadmins enable row level security;

revoke all on table public.platform_superadmins from public, anon, authenticated;

create or replace function public.is_platform_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.platform_superadmins ps on ps.profile_id = p.id
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.deleted_at is null
  );
$$;

revoke all on function public.is_platform_superadmin() from public, anon;
grant execute on function public.is_platform_superadmin() to authenticated;

commit;
