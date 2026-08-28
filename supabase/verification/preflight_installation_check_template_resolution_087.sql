-- READ-ONLY preflight for 087. Do not run this file as a migration.
with target_types(type_key, type_name) as (
  values
    ('abrigo', 'abrigo de muelle'),
    ('muelle', 'muelle de carga'),
    ('seccional', 'puerta seccional industrial')
),
template_counts as (
  select tt.type_key,
         count(ct.id) as active_count,
         count(ct.id) filter (where lower(coalesce(ct.name, '')) like '%instal%' or lower(coalesce(ct.name, '')) like '%puesta en marcha%') as specific_count
  from target_types tt
  left join public.equipment_types et on lower(et.name) = tt.type_name
  left join public.check_templates ct on ct.equipment_type_id = et.id and ct.active = true
  group by tt.type_key
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
  select 'public_schema'::text as check_name,
         case when to_regnamespace('public') is not null then 'OK' else 'BLOCKER' end::text as status,
         coalesce(to_regnamespace('public')::text, 'missing')::text as detail
  union all
  select 'equipment_types_table',
         case when to_regclass('public.equipment_types') is not null then 'OK' else 'BLOCKER' end,
         coalesce(to_regclass('public.equipment_types')::text, 'missing')
  union all
  select 'abrigo_active_templates', case when active_count > 0 then 'OK' else 'REVIEW' end, active_count::text from template_counts where type_key = 'abrigo'
  union all
  select 'abrigo_installation_specific_templates', case when specific_count > 0 then 'OK' else 'REVIEW' end, specific_count::text from template_counts where type_key = 'abrigo'
  union all
  select 'abrigo_fallback_templates', case when active_count - specific_count > 0 then 'OK' else 'REVIEW' end, (active_count - specific_count)::text from template_counts where type_key = 'abrigo'
  union all
  select 'muelle_active_templates', case when active_count > 0 then 'OK' else 'REVIEW' end, active_count::text from template_counts where type_key = 'muelle'
  union all
  select 'muelle_installation_specific_templates', case when specific_count > 0 then 'OK' else 'REVIEW' end, specific_count::text from template_counts where type_key = 'muelle'
  union all
  select 'muelle_fallback_templates', case when active_count - specific_count > 0 then 'OK' else 'REVIEW' end, (active_count - specific_count)::text from template_counts where type_key = 'muelle'
  union all
  select 'seccional_active_templates', case when active_count > 0 then 'OK' else 'REVIEW' end, active_count::text from template_counts where type_key = 'seccional'
  union all
  select 'seccional_installation_specific_templates', case when specific_count > 0 then 'OK' else 'REVIEW' end, specific_count::text from template_counts where type_key = 'seccional'
  union all
  select 'seccional_fallback_templates', case when active_count - specific_count > 0 then 'OK' else 'REVIEW' end, (active_count - specific_count)::text from template_counts where type_key = 'seccional'
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
