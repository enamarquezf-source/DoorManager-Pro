-- Strict read-only verification for REGISTER-TREASURY-MODULE. Exactly one result set.
with checks(check_group,check_name,status,affected_rows,details) as (
  select 'APP_MODULES','treasury_row',case when count(*)=1 and bool_and(code='treasury' and label='Tesorería' and active and sort_order=105) then 'PASS' else 'BLOCKER' end,count(*)::bigint,'Exactly one active treasury module row with canonical metadata'
  from public.app_modules where code='treasury'
  union all
  select 'APP_MODULES','schema_contract',case when count(*)=6 then 'PASS' else 'BLOCKER' end,count(*)::bigint,'app_modules exposes id, code, label, sort_order, active and created_at' from information_schema.columns where table_schema='public' and table_name='app_modules' and column_name in ('id','code','label','sort_order','active','created_at')
  union all
  select 'ACCESS','current_access_integration',case when to_regprocedure('public.dmp_get_current_access()') is not null and position('app_modules' in lower(pg_get_functiondef(to_regprocedure('public.dmp_get_current_access()'))))>0 and position('dmp_module_default_visible' in lower(pg_get_functiondef(to_regprocedure('public.dmp_get_current_access()'))))>0 and exists(select 1 from public.permissions where code='treasury.read') then 'PASS' else 'BLOCKER' end,1,'Current access RPC can include active modules and treasury permission exists'
), summary as (
  select 'SUMMARY' as check_group,'verify_133_register_treasury_module' as check_name,case when count(*) filter(where status='BLOCKER')=0 then 'PASS' else 'BLOCKER' end as status,count(*) filter(where status='BLOCKER')::bigint as affected_rows,case when count(*) filter(where status='BLOCKER')=0 then 'All checks passed' else 'Treasury module registration verification failed' end as details from checks
)
select check_group,check_name,status,affected_rows,details from (select check_group,check_name,status,affected_rows,details from checks union all select check_group,check_name,status,affected_rows,details from summary) result order by case when check_group='SUMMARY' then 1 else 0 end,check_group,check_name;
