-- Verificacion posterior 025 - ejecutar tras aplicar migracion 025.

select 'time_entries_audit_columns_after_025' as check_name,
       count(*) filter (where column_name = 'created_by') as created_by_present,
       count(*) filter (where column_name = 'updated_by') as updated_by_present
from information_schema.columns
where table_schema = 'public'
  and table_name = 'work_order_time_entries'
  and column_name in ('created_by','updated_by');

with expected(function_name, arguments, direct_authenticated) as (values
  ('dmp_upsert_work_order_time_entry', 'p_payload jsonb', true),
  ('dmp_delete_work_order_time_entry', 'p_time_entry_id uuid, p_reason text', true),
  ('dmp_work_order_time_worker_options', 'p_work_order_id uuid', true),
  ('dmp025_actor_profile', '', false),
  ('dmp025_has_active_assignment', 'p_work_order_id uuid, p_profile_id uuid', false),
  ('dmp025_can_commercial_operate', 'p_work public.work_orders, p_profile public.profiles', false),
  ('dmp025_assert_time_target', 'p_work_order_id uuid, p_target_profile_id uuid', false)
), matched as (
  select e.*, p.oid is not null as found,
         coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_execute,
         case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
         case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute
  from expected e
  left join pg_proc p on p.proname = e.function_name and pg_get_function_identity_arguments(p.oid) = e.arguments and p.pronamespace = 'public'::regnamespace
)
select 'rpc_permissions_after_025' as check_name,
       case when count(*) = count(*) filter (where found) and not bool_or(public_execute) and not bool_or(anon_execute) and bool_and(authenticated_execute = direct_authenticated) then 'OK' else 'FAIL' end as status,
       jsonb_agg(jsonb_build_object('function', function_name, 'found', found, 'authenticated_execute', authenticated_execute, 'expected_authenticated', direct_authenticated) order by function_name) as detail
from matched;

select 'time_entry_rpc_security_definer_after_025' as check_name,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) like '%dmp025_assert_time_target%' as validates_target,
       pg_get_functiondef(p.oid) like '%updated_by = v_actor.id%' as writes_updated_by
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'dmp_upsert_work_order_time_entry';

select 'time_entry_delete_rpc_security_after_025' as check_name,
       p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) like '%dmp025_assert_time_target%' as validates_target,
       pg_get_functiondef(p.oid) like '%v_entry.created_by = v_actor.id%' as allows_creator_audit_scope
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'dmp_delete_work_order_time_entry';

begin;
-- Pruebas manuales con fixtures reales, siempre en rollback:
-- Técnico A asignado registra sus propias horas:
-- select public.dmp_upsert_work_order_time_entry('{"work_order_id":"<work_order_id>","profile_id":"<technician_a>","work_date":"2026-08-10","started_at":"08:00","ended_at":"09:00","break_minutes":0,"description":"verify 025 propia"}'::jsonb);
-- Técnico A registra horas para Técnico B asignado:
-- select public.dmp_upsert_work_order_time_entry('{"work_order_id":"<work_order_id>","profile_id":"<technician_b>","duration_minutes":60,"description":"verify 025 compañero"}'::jsonb);
-- Debe fallar si profile_id pertenece a persona no asignada, inactiva, eliminada u otra empresa.
-- select * from public.dmp_work_order_time_worker_options('<work_order_id>'::uuid);
rollback;
