-- READ-ONLY postflight for 114. Do not run this file as a migration.
select check_name, status, detail
from (
  select 'platform_select_policy'::text as check_name,
         case when count(*) = 1 then 'OK' else 'BLOCKER' end::text as status,
         count(*)::text as detail
  from pg_policies where schemaname = 'public' and tablename = 'equipment_types' and policyname = 'equipment_types_platform_superadmin_select'
  union all
  select 'platform_write_policies',
         case when count(*) = 2 then 'OK' else 'BLOCKER' end,
         count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'equipment_types' and policyname in ('equipment_types_platform_superadmin_insert', 'equipment_types_platform_superadmin_update')
  union all
  select 'physical_delete_disabled',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'equipment_types' and cmd = 'DELETE'
) checks
order by check_name;
