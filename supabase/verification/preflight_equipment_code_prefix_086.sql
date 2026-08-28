-- READ-ONLY preflight for 086. Do not run this file as a migration.
select 'public_schema' as check_name,
       case when to_regnamespace('public') is not null then 'OK' else 'BLOCKER' end as status,
       coalesce(to_regnamespace('public')::text, 'missing') as detail
union all
select 'equipment_types_table',
       case when to_regclass('public.equipment_types') is not null then 'OK' else 'BLOCKER' end,
       coalesce(to_regclass('public.equipment_types')::text, 'missing')
union all
select 'prefix_function_previous_state',
       case when to_regprocedure('public.dmp_equipment_code_prefix(uuid)') is null then 'OK' else 'REVIEW' end,
       coalesce(to_regprocedure('public.dmp_equipment_code_prefix(uuid)')::text, 'not found')
order by check_name;
