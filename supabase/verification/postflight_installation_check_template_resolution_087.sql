-- READ-ONLY postflight for 087. Do not run this file as a migration.
with target_types(type_key, type_name) as (
  values
    ('abrigo', 'abrigo de muelle'),
    ('muelle', 'muelle de carga'),
    ('seccional', 'puerta seccional industrial')
),
resolved_targets as (
  select tt.type_key,
         et.id as equipment_type_id,
         public.dmp_resolve_check_template(et.company_id, et.id) as resolved_template_id
  from target_types tt
  left join public.equipment_types et on lower(et.name) = tt.type_name
),
resolved_details as (
  select rt.type_key,
         rt.equipment_type_id,
         rt.resolved_template_id,
         ct.equipment_type_id as resolved_template_type_id,
         case when rt.equipment_type_id = et.id then rt.equipment_type_id else null end as requested_equipment_type_id
  from resolved_targets rt
  left join public.equipment_types et on et.id = rt.equipment_type_id
  left join public.check_templates ct on ct.id = rt.resolved_template_id
),
target_resolution_metrics as (
  select count(distinct type_key) filter (where equipment_type_id is not null) as target_type_count,
         count(*) filter (where resolved_template_id is not null and resolved_template_type_id is distinct from equipment_type_id) as cross_type_count
  from resolved_details
),
par_metrics as (
  select count(distinct wo.id) as matching_work_orders,
         count(distinct woe.equipment_id) as equipment_count,
         count(distinct woe.equipment_id) filter (where woe.check_status = 'pending_template') as pending_template_count,
         count(distinct woe.equipment_id) filter (where woe.check_status = 'generated') as generated_count,
         count(distinct c.id) filter (where c.deleted_at is null) as actual_checks_count
  from public.work_orders wo
  left join public.work_order_equipment woe on woe.work_order_id = wo.id
  left join public.checks c on c.work_order_id = wo.id and c.equipment_id = woe.equipment_id and c.deleted_at is null
  where wo.code = 'PAR-2026-000023'
),
orphan_metrics as (
  select count(*) as orphan_count
  from public.work_order_equipment woe
  left join public.work_orders wo on wo.id = woe.work_order_id
  left join public.equipment e on e.id = woe.equipment_id
  where wo.id is null or e.id is null
     or woe.company_id is distinct from wo.company_id
     or woe.company_id is distinct from e.company_id
),
checks as (
  select 'resolver_function'::text as check_name,
         case when to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') is not null then 'OK' else 'BLOCKER' end::text as status,
         coalesce(to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)')::text, 'missing')::text as detail
  union all
  select 'resolver_signature', case when to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)')::text, 'missing')
  union all
  select 'resolver_authenticated_execute', case when exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') and has_function_privilege('authenticated', p.oid, 'EXECUTE')) then 'OK' else 'BLOCKER' end, 'authenticated'
  union all
  select 'abrigo_resolves_template', case when exists (select 1 from resolved_details where type_key = 'abrigo' and resolved_template_id is not null and resolved_template_type_id = equipment_type_id) then 'OK' else 'BLOCKER' end, 'active template resolved for exact equipment type'
  union all
  select 'muelle_resolves_template', case when exists (select 1 from resolved_details where type_key = 'muelle' and resolved_template_id is not null and resolved_template_type_id = equipment_type_id) then 'OK' else 'BLOCKER' end, 'active template resolved for exact equipment type'
  union all
  select 'seccional_resolves_template', case when exists (select 1 from resolved_details where type_key = 'seccional' and resolved_template_id is not null and resolved_template_type_id = equipment_type_id) then 'OK' else 'BLOCKER' end, 'active template resolved for exact equipment type'
  union all
  select 'resolver_never_crosses_equipment_type', case when target_type_count = 3 and cross_type_count = 0 then 'OK' else 'BLOCKER' end, format('%s target types, %s cross-type resolutions', target_type_count, cross_type_count) from target_resolution_metrics
  union all
  select 'create_work_order_full_preserved', case when to_regprocedure('public.create_work_order_full(jsonb)') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regprocedure('public.create_work_order_full(jsonb)')::text, 'missing')
  union all
  select 'dmp_create_work_order_full_preserved', case when to_regprocedure('public.dmp_create_work_order_full(jsonb)') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regprocedure('public.dmp_create_work_order_full(jsonb)')::text, 'missing')
  union all
  select 'generate_pending_installation_check_preserved', case when to_regprocedure('public.generate_pending_installation_check(uuid,uuid)') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regprocedure('public.generate_pending_installation_check(uuid,uuid)')::text, 'missing')
  union all
  select 'par_2026_000023_equipment_count', case when matching_work_orders = 1 then 'OK' else 'BLOCKER' end, equipment_count::text from par_metrics
  union all
  select 'par_2026_000023_pending_template_count', case when matching_work_orders = 1 then 'OK' else 'BLOCKER' end, pending_template_count::text from par_metrics
  union all
  select 'par_2026_000023_generated_count', case when matching_work_orders = 1 then 'OK' else 'BLOCKER' end, generated_count::text from par_metrics
  union all
  select 'par_2026_000023_actual_checks_count', case when matching_work_orders = 1 then 'OK' else 'BLOCKER' end, actual_checks_count::text from par_metrics
  union all
  select 'orphan_relationships', case when orphan_count = 0 then 'OK' else 'BLOCKER' end, orphan_count::text from orphan_metrics
)
select check_name, status, detail
from checks
order by check_name;
