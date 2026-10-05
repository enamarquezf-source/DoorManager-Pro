-- Read only. Expected: both helpers exist, are SECURITY DEFINER with a pinned
-- search_path and cannot be executed by anon/authenticated/PUBLIC.
with expected(signature) as (values
 ('public.dmp_ensure_work_order_equipment_check(uuid,uuid,uuid,uuid,text)'),
 ('public.dmp_resolve_check_template(uuid,uuid)')
), functions as (
 select e.signature, p.* from expected e
 left join pg_proc p on p.oid = to_regprocedure(e.signature)
)
select signature, oid is not null as function_exists,
 prosecdef as security_definer, proconfig as configuration,
 case when oid is not null then has_function_privilege('anon', oid, 'EXECUTE') end as anon_can_execute,
 case when oid is not null then has_function_privilege('authenticated', oid, 'EXECUTE') end as authenticated_can_execute,
 exists(select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_can_execute
from functions;
