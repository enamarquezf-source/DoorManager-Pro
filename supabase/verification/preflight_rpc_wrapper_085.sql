-- READ-ONLY preflight for 085. Do not run this file as a migration.
with original_function as (
  select p.oid,
         p.oid::regprocedure as signature,
         pg_get_function_arguments(p.oid) as arguments,
         pg_get_function_identity_arguments(p.oid) as identity_arguments,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_work_order_full'
)
select 'original_function' as check_name,
       case when exists (select 1 from original_function) then 'OK' else 'BLOCKER' end as status,
       coalesce((select signature::text from original_function), 'missing') as detail
union all
select 'original_argument',
       case when exists (select 1 from original_function where arguments = 'p_payload jsonb') then 'OK' else 'BLOCKER' end,
       coalesce((select arguments from original_function), 'missing')
union all
select 'original_authenticated_execute',
       case when exists (select 1 from original_function where authenticated_execute) then 'OK' else 'BLOCKER' end,
       coalesce((select authenticated_execute::text from original_function), 'missing')
union all
select 'wrapper_previous_state',
       case when to_regprocedure('public.dmp_create_work_order_full(jsonb)') is null then 'OK' else 'REVIEW' end,
       coalesce(to_regprocedure('public.dmp_create_work_order_full(jsonb)')::text, 'not found')
union all
select 'public_schema',
       case when to_regnamespace('public') is not null then 'OK' else 'BLOCKER' end,
       coalesce(to_regnamespace('public')::text, 'missing')
order by check_name;
