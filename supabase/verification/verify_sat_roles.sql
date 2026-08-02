-- Verificacion posterior a migraciones 018 y 019.
-- Ejecutar en Supabase SQL Editor con permisos de administrador.

select
  p.id,
  p.email,
  p.primary_area,
  array_agg(r.name order by r.name) as roles,
  bool_or(r.name = 'SAT') as has_sat,
  bool_or(r.name = 'Comercial') as has_comercial,
  not (bool_or(r.name = 'SAT') and bool_or(r.name = 'Comercial')) as sat_comercial_ok
from public.profiles p
left join public.profile_roles pr on pr.profile_id = p.id
left join public.roles r on r.id = pr.role_id
where p.email = 'marta.lopez@dmp-demo.test'
group by p.id, p.email, p.primary_area;

select
  p.company_id,
  count(*) filter (where p.primary_area = 'SAT') as sat_profiles,
  count(*) filter (where p.primary_area = 'Comercial') as commercial_profiles,
  count(*) filter (where sat.profile_id is not null and comercial.profile_id is not null) as invalid_sat_comercial_profiles
from public.profiles p
left join (
  select pr.profile_id from public.profile_roles pr join public.roles r on r.id = pr.role_id where r.name = 'SAT'
) sat on sat.profile_id = p.id
left join (
  select pr.profile_id from public.profile_roles pr join public.roles r on r.id = pr.role_id where r.name = 'Comercial'
) comercial on comercial.profile_id = p.id
where p.deleted_at is null
group by p.company_id
order by p.company_id;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','profile_roles','work_orders','work_order_assignments','checks','alert_recipients')
order by tablename, policyname;
