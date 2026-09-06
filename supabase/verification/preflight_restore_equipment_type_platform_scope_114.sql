-- READ-ONLY preflight for 114. Do not run this file as a migration.
select check_name, status, detail
from (
  select 'equipment_types_table'::text as check_name,
         case when to_regclass('public.equipment_types') is not null then 'OK' else 'BLOCKER' end::text as status,
         coalesce(to_regclass('public.equipment_types')::text, 'missing')::text as detail
  union all
  select 'platform_scope_function',
         case when to_regprocedure('public.is_platform_superadmin()') is not null then 'OK' else 'BLOCKER' end,
         coalesce(to_regprocedure('public.is_platform_superadmin()')::text, 'missing')
) checks
order by check_name;
