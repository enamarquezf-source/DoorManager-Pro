-- DoorManager Pro - postflight read-only de la migracion 115.
-- Ejecutar despues de aplicar 115 en Supabase SQL Editor.

with function_info as (
  select
    p.oid,
    n.nspname,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_get_function_result(p.oid) as return_type,
    p.prosecdef,
    p.proconfig,
    p.prosrc,
    has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
    has_function_privilege('anon', p.oid, 'execute') as anon_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_work_order_full'
)
select 'canonical_signature' as check_name,
       exists (
         select 1 from function_info
         where identity_arguments = 'p_payload jsonb'
           and return_type = 'uuid'
       ) as ok,
       coalesce((select string_agg(identity_arguments, ', ' order by oid) from function_info), 'missing') as detail
union all
select 'no_overload',
       (select count(*) = 1 from function_info),
       'public.create_work_order_full overload count=' || (select count(*)::text from function_info)
union all
select 'security_definer',
       coalesce((select prosecdef from function_info where identity_arguments = 'p_payload jsonb'), false),
       'prosecdef=' || coalesce((select prosecdef::text from function_info where identity_arguments = 'p_payload jsonb'), 'missing')
union all
select 'search_path_public',
       coalesce((select p.proconfig @> array['search_path=public']::text[] from function_info p where identity_arguments = 'p_payload jsonb'), false),
       'proconfig=' || coalesce((select proconfig::text from function_info where identity_arguments = 'p_payload jsonb'), 'missing')
union all
select 'authenticated_grant_only',
       coalesce((select authenticated_execute and not anon_execute from function_info where identity_arguments = 'p_payload jsonb'), false),
       'authenticated=' || coalesce((select authenticated_execute::text from function_info where identity_arguments = 'p_payload jsonb'), 'missing') ||
       ', anon=' || coalesce((select anon_execute::text from function_info where identity_arguments = 'p_payload jsonb'), 'missing')
union all
select 'creator_fallback_absent',
       coalesce((select position('coalesce(v_technician_id, v_created_by)' in lower(prosrc)) = 0 from function_info where identity_arguments = 'p_payload jsonb'), false),
       'creator fallback absent from canonical RPC source'
union all
select 'technician_responsible_expression',
       coalesce((select position('v_created_by, v_technician_id)' in lower(prosrc)) > 0 from function_info where identity_arguments = 'p_payload jsonb'), false),
       'canonical RPC stores explicit technician or null as current_responsible_id'
union all
select 'assignment_is_explicit_only',
       coalesce((select position('if v_technician_id is not null then perform public.assign_technician' in lower(prosrc)) > 0
                  and position('insert into public.work_order_assignments' in lower(prosrc)) = 0
                 from function_info where identity_arguments = 'p_payload jsonb'), false),
       'canonical RPC delegates assignments only when an explicit technician exists';

select pg_get_functiondef(oid) as canonical_create_work_order_full_definition
from pg_proc
where oid = 'public.create_work_order_full(jsonb)'::regprocedure;
