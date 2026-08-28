-- READ ONLY probe for the remote definition of the exact queue signature.
-- Does not execute the RPC and does not modify data.
with functions as (
  select p.oid,
    pg_get_function_identity_arguments(p.oid) as signature,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='dmp_department_routing_queue'
), target as (
  select * from functions where signature='p_queue text' limit 1
)
select
  exists(select 1 from target) as queue_function_exists,
  coalesce(position('e.name' in lower((select definition from target)))>0, false) as contains_e_dot_name,
  coalesce(position('e.code' in lower((select definition from target)))>0, false) as contains_e_dot_code,
  case when exists(select 1 from target) then substring((select definition from target) from greatest(position('string_agg' in lower((select definition from target)))-40, 1) for 240) else null end as relevant_equipment_expression,
  case when exists(select 1 from target) then md5((select definition from target)) else null end as function_definition_hash,
  (select signature from target) as signature,
  (select string_agg(signature, '; ' order by signature) from functions) as overloads,
  has_function_privilege('authenticated','public.dmp_department_routing_queue(text)','EXECUTE') as authenticated_execute,
  has_function_privilege('anon','public.dmp_department_routing_queue(text)','EXECUTE') as anon_execute;
