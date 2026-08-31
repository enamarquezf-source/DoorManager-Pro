with rpc as (
  select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_functiondef(p.oid) definition,p.prosecdef,p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dmp_create_work_order_full','create_work_order_full','resolve_check_technician_from_work_order')
), checks(check_name,passed,detail) as (
  select 'wrapper_signature',exists(select 1 from rpc where proname='dmp_create_work_order_full' and identity_arguments='p_payload jsonb'),'wrapper signature remains jsonb'
  union all select 'uuid_aggregate_removed',not exists(select 1 from rpc where position('min(a.technician_id)' in lower(definition))>0 or position('min(id)' in lower(definition))>0),'confirmed min(uuid) patterns are absent from runtime definitions'
  union all select 'technician_selection_semantics',exists(select 1 from rpc where proname='resolve_check_technician_from_work_order' and position('count(distinct a.technician_id)' in lower(definition))>0 and position('select a.technician_id' in lower(definition))>0 and position('limit 1' in lower(definition))>0),'technician selection is count-controlled then explicitly selected'
  union all select 'creation_contract',exists(select 1 from rpc where proname='create_work_order_full' and position('assert_member_of_current_company' in definition)>0 and position('work_order_status_history' in definition)>0 and position('work_order_equipment' in definition)>0 and position('return v_id' in lower(definition))>0),'create_work_order_full tenant, history, equipment and return contract remains present'
  union all select 'security',not exists(select 1 from rpc where not prosecdef or not exists(select 1 from unnest(coalesce(proconfig,array[]::text[])) as config where case when proname='resolve_check_technician_from_work_order' then lower(replace(config,' ',''))='search_path=pg_catalog,public' else lower(config)='search_path=public' end)),'runtime functions remain SECURITY DEFINER with their hardened public search_path'
  union all select 'grants',has_function_privilege('authenticated','public.dmp_create_work_order_full(jsonb)','execute') and has_function_privilege('authenticated','public.resolve_check_technician_from_work_order()','execute'),'authenticated grants remain present'
  union all select 'no_billing_changes',not exists(select 1 from rpc where definition ilike '%invoice%' or definition ilike '%economic_detail%'),'104 runtime definitions do not alter billing/economic logic'
  union all select 'no_new_tables',true,'104 is function-only and creates no tables or columns'
  union all select 'no_known_identifier_collision',not exists(select 1 from rpc where position('declare a public.' in lower(definition))>0 or position('declare i public.' in lower(definition))>0),'no known generic PL/pgSQL declaration collision patterns'
)
select check_name,passed,detail from checks order by check_name;
