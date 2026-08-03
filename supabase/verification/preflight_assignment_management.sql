-- Preflight only: run before 021_assignment_management_hardening.sql.
-- It does not modify data.

select
  n.nspname as schema,
  p.proname as function_name,
  oidvectortypes(p.proargtypes) as arguments,
  p.proacl as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'unassign_work_order_profile'
order by arguments;

select
  count(*) as total_unassign_signatures,
  array_agg(oidvectortypes(p.proargtypes) order by oidvectortypes(p.proargtypes)) as signature_arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'unassign_work_order_profile';

select
  coalesce(r.name, p.primary_area, 'Sin rol') as responsible_role,
  count(*) as work_orders
from public.work_orders wo
join public.profiles p on p.id = wo.current_responsible_id
left join public.profile_roles pr on pr.profile_id = p.id
left join public.roles r on r.id = pr.role_id
where wo.deleted_at is null
  and wo.current_responsible_id is not null
group by coalesce(r.name, p.primary_area, 'Sin rol')
order by work_orders desc;

select
  wo.id,
  wo.code,
  wo.company_id,
  wo.current_responsible_id,
  coalesce(r.name, p.primary_area, 'Sin rol') as responsible_role
from public.work_orders wo
join public.profiles p on p.id = wo.current_responsible_id
left join public.profile_roles pr on pr.profile_id = p.id
left join public.roles r on r.id = pr.role_id
where wo.deleted_at is null
  and wo.current_responsible_id is not null
  and coalesce(r.name, p.primary_area, 'Sin rol') <> 'Comercial'
order by wo.code;

select
  wo.id,
  wo.code,
  wo.company_id,
  wo.main_technician_id,
  wo.current_responsible_id
from public.work_orders wo
where wo.deleted_at is null
  and wo.main_technician_id is not null
  and wo.current_responsible_id = wo.main_technician_id
order by wo.code;

select
  work_order_id,
  technician_id,
  assignment_date,
  count(*) as active_rows,
  array_agg(role order by role) as roles
from public.work_order_assignments
where deleted_at is null
group by work_order_id, technician_id, assignment_date
having count(*) > 1
order by active_rows desc;

select
  work_order_id,
  technician_id,
  count(*) filter (where role = 'Principal') as principal_rows_same_technician,
  array_agg(assignment_date order by assignment_date) filter (where role = 'Principal') as principal_dates
from public.work_order_assignments
where deleted_at is null
group by work_order_id, technician_id
having count(*) filter (where role = 'Principal') > 1
order by principal_rows_same_technician desc;

select
  work_order_id,
  count(*) filter (where role = 'Principal') as active_principals,
  count(distinct technician_id) filter (where role = 'Principal') as distinct_principal_technicians,
  array_agg(technician_id) filter (where role = 'Principal') as principal_ids
from public.work_order_assignments
where deleted_at is null
group by work_order_id
having count(distinct technician_id) filter (where role = 'Principal') > 1
order by distinct_principal_technicians desc;
