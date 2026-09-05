-- READ-ONLY semantic postflight for 111. Do not run this file as a migration.
with association_checks as (
  select
    woe.work_order_id,
    wo.type as work_order_type,
    woe.check_status as link_check_status,
    count(c.id) filter (where c.deleted_at is null) as active_check_count
  from public.work_order_equipment woe
  join public.work_orders wo on wo.id = woe.work_order_id
  left join public.checks c on c.work_order_id = woe.work_order_id and c.equipment_id = woe.equipment_id
  where wo.deleted_at is null and wo.type in ('Instalacion', 'Mantenimiento')
  group by woe.work_order_id, wo.type, woe.equipment_id, woe.check_status
), metrics as (
  select
    count(*) as total_associations,
    count(*) filter (where active_check_count = 1) as check_created,
    count(*) filter (where active_check_count = 0 and link_check_status = 'pending_template') as pending_template,
    count(*) filter (where active_check_count = 0 and link_check_status = 'not_applicable') as invalid_not_applicable,
    count(*) filter (where active_check_count = 0 and coalesce(link_check_status, '') in ('generated', 'not_applicable')) as missing,
    count(*) filter (where active_check_count = 0 and coalesce(link_check_status, '') not in ('pending_template', 'generated', 'not_applicable')) as other,
    count(*) filter (where active_check_count > 1) as duplicates
  from association_checks
)
select 'coverage_accounting'::text as check_name,
       case when total_associations = check_created + pending_template + missing + other + duplicates then 'OK' else 'BLOCKER' end::text as status,
       format('%s asociaciones = %s checks + %s pending + %s missing + %s other + %s duplicates', total_associations, check_created, pending_template, missing, other, duplicates) as detail
from metrics
union all
select 'missing_unexpected_checks', case when missing = 0 then 'OK' else 'BLOCKER' end, missing::text from metrics
union all
select 'duplicate_checks', case when duplicates = 0 then 'OK' else 'BLOCKER' end, duplicates::text from metrics
union all
select 'other_link_statuses', case when other = 0 then 'OK' else 'BLOCKER' end, other::text from metrics
union all
select 'maintenance_not_applicable', case when invalid_not_applicable = 0 then 'OK' else 'BLOCKER' end, invalid_not_applicable::text from metrics;
