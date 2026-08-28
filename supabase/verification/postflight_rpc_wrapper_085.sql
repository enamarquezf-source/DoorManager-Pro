-- READ-ONLY postflight for 085. Do not run this file as a migration.
with wrapper_function as (
  select p.oid,
         p.oid::regprocedure as signature,
         pg_get_function_arguments(p.oid) as arguments,
         pg_get_function_identity_arguments(p.oid) as identity_arguments,
         pg_get_function_result(p.oid) as result,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dmp_create_work_order_full'
)
select 'wrapper_function' as check_name,
       case when exists (select 1 from wrapper_function) then 'OK' else 'BLOCKER' end as status,
       coalesce((select signature::text from wrapper_function), 'missing') as detail
union all
select 'wrapper_arguments',
       case when exists (select 1 from wrapper_function where arguments = 'p_payload jsonb') then 'OK' else 'BLOCKER' end,
       coalesce((select arguments from wrapper_function), 'missing')
union all
select 'wrapper_result',
       case when exists (select 1 from wrapper_function where result = 'uuid') then 'OK' else 'BLOCKER' end,
       coalesce((select result from wrapper_function), 'missing')
union all
select 'wrapper_authenticated_execute',
       case when exists (select 1 from wrapper_function where authenticated_execute) then 'OK' else 'BLOCKER' end,
       coalesce((select authenticated_execute::text from wrapper_function), 'missing')
union all
select 'original_function_preserved',
       case when to_regprocedure('public.create_work_order_full(jsonb)') is not null then 'OK' else 'BLOCKER' end,
       coalesce(to_regprocedure('public.create_work_order_full(jsonb)')::text, 'missing')
order by check_name;
