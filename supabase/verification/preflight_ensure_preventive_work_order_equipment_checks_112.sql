-- READ-ONLY preflight for 112. Do not run this file as a migration.
select check_name, status, detail
from (
  select 'base_tables'::text as check_name,
         case when to_regclass('public.work_orders') is not null
                   and to_regclass('public.equipment') is not null
                   and to_regclass('public.work_order_equipment') is not null
                   and to_regclass('public.checks') is not null
              then 'OK' else 'BLOCKER' end::text as status,
         'work_orders, equipment, work_order_equipment, checks'::text as detail
  union all
  select 'template_resolver',
         case when to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') is not null then 'OK' else 'BLOCKER' end,
         coalesce(to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)')::text, 'missing')
  union all
  select 'preventive_check_helper',
         case when to_regprocedure('public.dmp_ensure_work_order_equipment_check(uuid,uuid,uuid,uuid,text)') is not null then 'OK' else 'BLOCKER' end,
         coalesce(to_regprocedure('public.dmp_ensure_work_order_equipment_check(uuid,uuid,uuid,uuid,text)')::text, 'missing')
) checks
order by check_name;
