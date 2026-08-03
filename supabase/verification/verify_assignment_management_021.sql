-- Verification after 021_assignment_management_hardening.sql.
-- It does not modify data.

select
  count(*) as unassign_signature_count,
  array_agg(oidvectortypes(p.proargtypes) order by oidvectortypes(p.proargtypes)) as signatures
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'unassign_work_order_profile';

select
  has_function_privilege('anon', 'public.unassign_work_order_profile(uuid, uuid, uuid, text)', 'EXECUTE') as anon_can_execute,
  has_function_privilege('public', 'public.unassign_work_order_profile(uuid, uuid, uuid, text)', 'EXECUTE') as public_can_execute,
  has_function_privilege('authenticated', 'public.unassign_work_order_profile(uuid, uuid, uuid, text)', 'EXECUTE') as authenticated_can_execute;

select count(*) as technical_responsibles
from public.work_orders wo
join public.profiles p on p.id = wo.current_responsible_id
where wo.deleted_at is null
  and (p.primary_area = 'Tecnico' or exists (select 1 from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = p.id and r.name = 'Tecnico'));

select count(*) as work_orders_with_distinct_principal_conflicts
from (
  select work_order_id
  from public.work_order_assignments
  where deleted_at is null and role = 'Principal'
  group by work_order_id
  having count(distinct technician_id) > 1
) conflicts;

select count(*) as exact_active_assignment_duplicates
from (
  select work_order_id, technician_id, assignment_date
  from public.work_order_assignments
  where deleted_at is null
  group by work_order_id, technician_id, assignment_date
  having count(*) > 1
) duplicates;
