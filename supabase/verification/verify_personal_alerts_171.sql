-- Solo lectura: diagnostica la disponibilidad de la bandeja individual.
select signature,
       to_regprocedure(signature) is not null as function_exists,
       coalesce(has_function_privilege('authenticated', to_regprocedure(signature), 'execute'), false) as authenticated_can_execute
from (values
  ('public.dmp_list_personal_alerts(text)'),
  ('public.dmp_update_alert_recipient(uuid,text)'),
  ('public.mark_alert_as_read(uuid,uuid)'),
  ('public.dmp024_active_profile()')
) functions(signature);

select to_regclass('public.alert_personal_states') is not null as personal_states_exists;
