-- READ-ONLY preflight for 113. Do not run this file as a migration.
select check_name, status, detail
from (
  select 'equipment_types_table'::text as check_name,
         case when to_regclass('public.equipment_types') is not null then 'OK' else 'BLOCKER' end::text as status,
         coalesce(to_regclass('public.equipment_types')::text, 'missing')::text as detail
  union all
  select 'equipment_types_rls',
         case when c.relrowsecurity then 'OK' else 'BLOCKER' end,
         'row level security enabled'
  from pg_class c where c.oid = 'public.equipment_types'::regclass
  union all
  select 'equipment_type_foreign_keys',
         case when exists (select 1 from pg_constraint where conrelid = 'public.equipment'::regclass and conname like '%equipment_type%')
                   and exists (select 1 from pg_constraint where conrelid = 'public.check_templates'::regclass and conname like '%equipment_type%') then 'OK' else 'BLOCKER' end,
         'equipment and check_templates retain equipment_type_id references'
) checks
order by check_name;
