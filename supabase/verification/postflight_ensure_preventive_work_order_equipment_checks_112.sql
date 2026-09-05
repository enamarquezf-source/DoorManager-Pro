-- READ-ONLY semantic postflight for 112. Do not run this file as a migration.
-- Runtime checks are deployment blockers; existing data quality is informational.
with function_defs as (
  select
    to_regprocedure('public.dmp_ensure_work_order_equipment_check(uuid,uuid,uuid,uuid,text)') as helper_oid,
    to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') as resolver_oid,
    to_regprocedure('public.create_work_order_full(jsonb)') as creation_oid,
    to_regprocedure('public.generate_pending_installation_check(uuid,uuid)') as pending_oid
), definitions as (
  select
    coalesce(lower(regexp_replace(pg_get_functiondef(helper_oid), '\s+', ' ', 'g')), '') as helper_definition,
    helper_oid,
    resolver_oid,
    creation_oid,
    pending_oid
  from function_defs
), runtime_checks as (
  select 'RUNTIME / DEPLOYMENT'::text as check_group, 'preventive_runtime_support'::text as check_name,
         case when helper_oid is not null and helper_definition like '%p_work_order_type not in (''instalacion'', ''mantenimiento'', ''preventivo'')%' then 'OK' else 'BLOCKER' end::text as status,
         'helper incluye Instalacion, Mantenimiento y Preventivo'::text as detail
  from definitions
  union all
  select 'RUNTIME / DEPLOYMENT', 'installation_runtime_support',
         case when helper_definition like '%''instalacion''%' then 'OK' else 'BLOCKER' end,
         'helper conserva soporte de Instalacion'
  from definitions
  union all
  select 'RUNTIME / DEPLOYMENT', 'maintenance_runtime_support',
         case when helper_definition like '%''mantenimiento''%' then 'OK' else 'BLOCKER' end,
         'helper conserva soporte de Mantenimiento'
  from definitions
  union all
  select 'RUNTIME / DEPLOYMENT', 'commercial_excluded',
         case when helper_definition like '%p_work_order_type not in (''instalacion'', ''mantenimiento'', ''preventivo'')%' and helper_definition not like '%p_work_order_type not in (''instalacion'', ''mantenimiento'')%' then 'OK' else 'BLOCKER' end,
         'Visita comercial queda fuera del contrato automático'
  from definitions
  union all
  select 'RUNTIME / DEPLOYMENT', 'template_resolver',
         case when resolver_oid is not null then 'OK' else 'BLOCKER' end,
         coalesce(resolver_oid::text, 'missing')
  from definitions
  union all
  select 'RUNTIME / DEPLOYMENT', 'required_functions',
         case when helper_oid is not null and resolver_oid is not null and creation_oid is not null and pending_oid is not null then 'OK' else 'BLOCKER' end,
         format('helper=%s resolver=%s create=%s pending=%s', helper_oid is not null, resolver_oid is not null, creation_oid is not null, pending_oid is not null)
  from definitions
  union all
  select 'RUNTIME / DEPLOYMENT', 'unique_runtime_signatures',
         case when (select count(*) from pg_proc where oid = helper_oid) <= 1 and (select count(*) from pg_proc where oid = resolver_oid) <= 1 then 'OK' else 'BLOCKER' end,
         'No hay firmas runtime duplicadas para helper/resolver'
  from definitions
), historical as (
  select
    wo.code,
    wo.type,
    woe.check_status,
    count(c.id) filter (where c.deleted_at is null) as active_check_count
  from public.work_order_equipment woe
  join public.work_orders wo on wo.id = woe.work_order_id
  left join public.checks c on c.work_order_id = woe.work_order_id and c.equipment_id = woe.equipment_id
  where wo.deleted_at is null and wo.type in ('Instalacion', 'Mantenimiento', 'Preventivo')
  group by wo.code, wo.type, woe.equipment_id, woe.check_status
), historical_metrics as (
  select
    count(*) filter (where active_check_count = 0 and coalesce(check_status, '') in ('generated', 'not_applicable')) as missing_checks,
    count(*) filter (where active_check_count = 0 and type = 'Preventivo' and check_status = 'not_applicable') as preventive_not_applicable,
    count(*) filter (where active_check_count > 1) as duplicate_checks,
    coalesce(string_agg(code, ', ' order by code) filter (where active_check_count = 0 and coalesce(check_status, '') in ('generated', 'not_applicable')), 'none') as missing_codes
  from historical
), historical_checks as (
  select 'HISTORICAL DATA'::text as check_group, 'historical_missing_checks'::text as check_name,
         'INFO'::text as status, format('%s existing associations without active check · parts: %s', missing_checks, missing_codes) as detail
  from historical_metrics
  union all
  select 'HISTORICAL DATA', 'historical_preventive_not_applicable', 'INFO', preventive_not_applicable::text from historical_metrics
  union all
  select 'HISTORICAL DATA', 'historical_duplicate_checks', case when duplicate_checks = 0 then 'OK' else 'INFO' end, duplicate_checks::text from historical_metrics
)
select check_group, check_name, status, detail from runtime_checks
union all
select check_group, check_name, status, detail from historical_checks
order by check_group, check_name;
