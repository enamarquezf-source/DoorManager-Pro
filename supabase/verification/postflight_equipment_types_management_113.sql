-- READ-ONLY postflight for 113. Do not run this file as a migration.
select check_name, status, detail
from (
  select 'scoped_select_policy'::text as check_name,
         case when count(*) = 1 then 'OK' else 'BLOCKER' end::text as status,
         count(*)::text as detail
  from pg_policies where schemaname = 'public' and tablename = 'equipment_types' and policyname = 'equipment_types_select_scoped'
  union all
  select 'admin_write_policies',
         case when count(*) = 2 then 'OK' else 'BLOCKER' end,
         count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'equipment_types' and policyname in ('equipment_types_insert_admin', 'equipment_types_update_admin')
  union all
  select 'physical_delete_disabled',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'equipment_types' and cmd = 'DELETE'
  union all
  select 'equipment_type_fk_preserved',
         case when exists (select 1 from pg_constraint where conrelid = 'public.equipment'::regclass and conname like '%equipment_type%') then 'OK' else 'BLOCKER' end,
         'equipment_type_id FK remains present'
) checks
order by check_name;
