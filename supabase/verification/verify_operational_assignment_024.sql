-- Verificacion posterior 024 - ejecutar tras aplicar migracion 024.

with expected(function_name, arguments, direct_authenticated) as (values
  ('dmp_diagnose_work_order_operation', 'p_work_order_id uuid', true),
  ('dmp_upsert_work_order_time_entry', 'p_payload jsonb', true),
  ('dmp_upsert_work_order_material', 'p_payload jsonb', true),
  ('dmp_change_work_order_status', 'p_work_order_id uuid, p_new_status text, p_reason text', true),
  ('unassign_work_order_profile', 'p_work_order_id uuid, p_profile_id uuid, p_changed_by uuid, p_reason text', true),
  ('technician_global_search', 'p_query text', true),
  ('dmp024_active_profile', '', false),
  ('dmp024_assert_work_order_operator', 'p_work_order_id uuid, p_manage_other_profile boolean', false),
  ('dmp024_work_minutes', 'p_start time without time zone, p_end time without time zone, p_break integer, p_manual integer', false),
  ('dmp024_can_commercial_operate', 'p_work public.work_orders, p_profile public.profiles', false),
  ('dmp024_is_work_order_active_status', 'p_status text', false)
), matched as (
  select e.*, p.oid is not null as found,
         coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_execute,
         case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
         case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute
  from expected e
  left join pg_proc p on p.proname = e.function_name and pg_get_function_identity_arguments(p.oid) = e.arguments and p.pronamespace = 'public'::regnamespace
)
select 'rpc_permissions_after_024' as check_name,
       case when count(*) = count(*) filter (where found) and not bool_or(public_execute) and not bool_or(anon_execute) and bool_and(authenticated_execute = direct_authenticated) then 'OK' else 'FAIL' end as status,
       count(*) as expected_functions,
       count(*) filter (where found) as found_functions,
       jsonb_agg(jsonb_build_object('function', function_name, 'found', found, 'authenticated_execute', authenticated_execute, 'expected_authenticated', direct_authenticated) order by function_name) as detail
from matched;

select 'technician_views_after_024' as check_name,
       count(*) filter (where table_name = 'v_technician_daily_schedule') as schedule_view,
       count(*) filter (where table_name = 'v_pending_checks') as pending_checks_view
from information_schema.views
where table_schema = 'public'
  and table_name in ('v_technician_daily_schedule','v_pending_checks');

begin;
-- Pruebas manuales con fixtures reales, siempre en rollback:
-- select public.dmp_diagnose_work_order_operation('<work_order_id>'::uuid);
-- select public.dmp_upsert_work_order_time_entry('{"work_order_id":"<work_order_id>","work_date":"2026-08-09","started_at":"08:00","ended_at":"09:00","break_minutes":0,"description":"Verificacion 024 rollback"}'::jsonb);
-- select public.dmp_upsert_work_order_material('{"work_order_id":"<work_order_id>","description":"Material 024 rollback","quantity":1,"unit":"ud","local_change_id":"verify-024"}'::jsonb);
-- select public.dmp_change_work_order_status('<work_order_id>'::uuid, 'Finalizado tecnicamente', 'verify 024 rollback');
rollback;
