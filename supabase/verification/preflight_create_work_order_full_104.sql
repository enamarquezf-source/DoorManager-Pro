with checks(check_name,passed,detail) as (
  select 'base_rpc',to_regprocedure('public.dmp_create_work_order_full(jsonb)') is not null,'public dmp_create_work_order_full(jsonb) exists before 104'
  union all select 'base_dependency',to_regprocedure('public.create_work_order_full(jsonb)') is not null,'public create_work_order_full(jsonb) exists before 104'
  union all select 'signature',pg_get_function_identity_arguments(p.oid)='p_payload jsonb','dmp_create_work_order_full signature is jsonb' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_create_work_order_full'
  union all select 'uuid_aggregate_present',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_check_technician_from_work_order' and position('min(a.technician_id)' in lower(pg_get_functiondef(p.oid)))>0),'pre-104 check trigger contains the confirmed unsupported UUID aggregate'
  union all select 'security_baseline',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_create_work_order_full' and p.prosecdef and exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) as config where lower(config)='search_path=public')),'creation wrapper remains SECURITY DEFINER with public search_path'
  union all select 'grants_baseline',has_function_privilege('authenticated','public.dmp_create_work_order_full(jsonb)','execute'),'authenticated can execute creation wrapper'
  union all select '104_not_installed',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='resolve_check_technician_from_work_order' and position('select a.technician_id' in lower(pg_get_functiondef(p.oid)))>0),'104 semantic replacement is not installed yet'
  union all select 'no_new_tables',true,'104 is function-only and requires no new tables'
)
select check_name,passed,detail from checks order by check_name;
