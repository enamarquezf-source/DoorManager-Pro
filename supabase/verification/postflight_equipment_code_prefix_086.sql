-- READ-ONLY postflight for 086. Do not run this file as a migration.
with prefix_function as (
  select p.oid,
         p.oid::regprocedure as signature,
         pg_get_functiondef(p.oid) as definition,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'dmp_equipment_code_prefix'
)
select 'prefix_function' as check_name,
       case when exists (select 1 from prefix_function) then 'OK' else 'BLOCKER' end as status,
       coalesce((select signature::text from prefix_function), 'missing') as detail
union all
select 'prefix_signature',
       case when exists (select 1 from prefix_function where signature::text = 'dmp_equipment_code_prefix(uuid)') then 'OK' else 'BLOCKER' end,
       coalesce((select signature::text from prefix_function), 'missing')
union all
select 'authenticated_execute',
       case when exists (select 1 from prefix_function where authenticated_execute) then 'OK' else 'BLOCKER' end,
       coalesce((select authenticated_execute::text from prefix_function), 'missing')
union all
select 'canonical_prefix_rules',
       case when exists (
         select 1 from prefix_function
         where definition like '%EQ-CUA%'
           and definition like '%EQ-BAR%'
           and definition like '%EQ-RAP%'
           and definition like '%EQ-ENR%'
           and definition like '%EQ-COR%'
           and definition like '%EQ-BAT%'
           and definition like '%EQ-ABR%'
           and definition like '%EQ-MUE%'
           and definition like '%EQ-PEA%'
           and definition like '%EQ-CAN%'
           and definition like '%EQ-SEC%'
       ) then 'OK' else 'BLOCKER' end,
       'canonical equipment prefix mapping'
order by check_name;
