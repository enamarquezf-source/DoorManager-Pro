-- Read-only postflight. Existing snapshots must not be rewritten.
begin;
do $$
declare definition text;
begin
  select pg_get_functiondef(coalesce(to_regprocedure('public.dmp_cost_study_operational_sources(date,date)'), 'public.dmp_cost_study_sources(date,date)'::regprocedure)) into definition;
  if position('work_scope_version' in definition) = 0 or position('invoiced_in_period' in definition) = 0
    or position('completed_in_period' in definition) = 0 or position('scheduled_in_period' in definition) = 0 then
    raise exception 'La consulta no tiene el desglose ampliado de partes';
  end if;
  if position('l.company_id = actor.company_id' in definition) = 0 or position('has_any_role' in definition) = 0 then
    raise exception 'Falta aislamiento por empresa o permiso';
  end if;
  if has_function_privilege('anon','public.dmp_cost_study_sources(date,date)','EXECUTE') then raise exception 'Acceso anónimo no permitido'; end if;
  if not has_function_privilege('authenticated','public.dmp_cost_study_sources(date,date)','EXECUTE') then raise exception 'Falta acceso autenticado'; end if;
end;
$$;
select id,company_id,finished_at,scheduled_date,deleted_at from public.work_orders limit 0;
select invoice_id,company_id,work_order_id,deleted_at from public.invoice_work_orders limit 0;
rollback;
