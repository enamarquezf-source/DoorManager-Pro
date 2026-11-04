-- Only in demo project xlhzyhotzfflemjnqvqn. Never run against Pro.
-- The initial schema creates roles_authenticated_read but omits roles from
-- its RLS-enabling table loop. Keep the global role catalogue read-only.
begin;

do $$ begin
  if to_regclass('public.dmp_demo_config') is null
     or to_regclass('public.dmp_demo_sessions') is null then
    raise exception 'This patch requires the isolated public demo installation';
  end if;
end $$;

alter table public.roles enable row level security;
revoke all privileges on table public.roles from public, anon, authenticated;
grant select on table public.roles to authenticated;
drop policy if exists roles_authenticated_read on public.roles;
create policy roles_authenticated_read on public.roles
  for select to authenticated using (true);

commit;

-- Expected: no rows. Does not check other advisor categories.
select schemaname, tablename
from pg_tables
where schemaname = 'public' and not rowsecurity
order by tablename;
