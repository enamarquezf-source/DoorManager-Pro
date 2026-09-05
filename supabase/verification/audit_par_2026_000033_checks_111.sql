-- READ-ONLY audit for PAR-2026-000033 after migration 111.
-- No checks, links, templates, or other data are created or changed.
with target as (
  select id, code, type, created_at, updated_at, quote_id, main_equipment_id, company_id
  from public.work_orders
  where code = 'PAR-2026-000033'
    and deleted_at is null
), equipment_sources as (
  select t.id as work_order_id, t.company_id, t.main_equipment_id as equipment_id, true as from_main, false as from_bridge
  from target t
  where t.main_equipment_id is not null
  union
  select woe.work_order_id, woe.company_id, woe.equipment_id, false, true
  from public.work_order_equipment woe
  join target t on t.id = woe.work_order_id
), equipment_rows as (
  select
    es.work_order_id,
    es.company_id,
    es.equipment_id,
    bool_or(es.from_main) as from_main,
    bool_or(es.from_bridge) as from_bridge
  from equipment_sources es
  group by es.work_order_id, es.company_id, es.equipment_id
), association_checks as (
  select
    er.work_order_id,
    t.code as work_order_code,
    t.type as work_order_type,
    t.created_at as work_order_created_at,
    t.updated_at as work_order_updated_at,
    t.quote_id,
    t.main_equipment_id,
    er.equipment_id,
    e.code as equipment_code,
    concat_ws(' · ', e.brand, e.model, e.internal_location) as equipment_name,
    et.name as equipment_type,
    case when er.from_main and er.from_bridge then 'BOTH' when er.from_main then 'MAIN_EQUIPMENT' else 'WORK_ORDER_EQUIPMENT' end as relation_found_by,
    woe.is_primary,
    woe.check_status as link_check_status,
    woe.check_message as link_check_message,
    coalesce(check_row.active_check_count, 0)::bigint as check_count,
    check_row.check_id,
    check_row.template_id,
    check_row.check_status,
    resolved.resolved_template_id
  from equipment_rows er
  join target t on t.id = er.work_order_id
  left join public.equipment e on e.id = er.equipment_id
  left join public.equipment_types et on et.id = e.equipment_type_id
  left join public.work_order_equipment woe on woe.work_order_id = er.work_order_id and woe.equipment_id = er.equipment_id
  left join lateral (
    select c.id as check_id, c.template_id, c.status as check_status, count(*) over () as active_check_count
    from public.checks c
    where c.work_order_id = er.work_order_id and c.equipment_id = er.equipment_id and c.deleted_at is null
    order by c.created_at, c.id
    limit 1
  ) check_row on true
  left join lateral (
    select public.dmp_resolve_check_template(t.company_id, e.equipment_type_id) as resolved_template_id
  ) resolved on true
), classified as (
  select association_checks.*,
    case
      when check_count > 1 then 'DUPLICATE_CHECK'
      when check_count = 1 then 'CHECK_CREATED'
      when link_check_status = 'pending_template' then 'PENDING_TEMPLATE'
      when link_check_status = 'not_applicable' and work_order_type not in ('Instalacion', 'Mantenimiento') then 'NOT_APPLICABLE'
      when link_check_status in ('generated', 'not_applicable') then 'MISSING_CHECK'
      when resolved_template_id is not null then 'MISSING_CHECK'
      when resolved_template_id is null then 'PENDING_TEMPLATE'
      else 'OTHER'
    end as final_classification,
    case
      when check_count = 0 and resolved_template_id is not null then 'HISTORICAL_MISSING_CHECK'
      when check_count = 0 and resolved_template_id is null then 'HISTORICAL_PENDING_TEMPLATE'
      when check_count = 1 then 'CHECK_CREATED'
      else null
    end as historical_classification
  from association_checks
), part_summary as (
  select
    work_order_id,
    work_order_code,
    work_order_type,
    work_order_created_at,
    work_order_updated_at,
    quote_id,
    main_equipment_id,
    count(*)::bigint as total_associations,
    count(*) filter (where coalesce(is_primary, false))::bigint as primary_count,
    count(*) filter (where not coalesce(is_primary, false))::bigint as additional_count,
    coalesce(sum(check_count), 0)::bigint as active_checks,
    count(*) filter (where final_classification = 'CHECK_CREATED')::bigint as check_created,
    count(*) filter (where final_classification = 'PENDING_TEMPLATE')::bigint as pending_template,
    count(*) filter (where final_classification = 'NOT_APPLICABLE')::bigint as not_applicable,
    count(*) filter (where final_classification = 'MISSING_CHECK')::bigint as missing,
    count(*) filter (where final_classification = 'DUPLICATE_CHECK')::bigint as duplicates,
    count(*) filter (where final_classification = 'OTHER')::bigint as other
  from classified
  group by work_order_id, work_order_code, work_order_type, work_order_created_at, work_order_updated_at, quote_id, main_equipment_id
), type_summary as (
  select work_order_id, equipment_type, count(*)::bigint as equipment_count
  from classified
  group by work_order_id, equipment_type
), combined as (
select
  'SUMMARY'::text as row_kind,
  summary.work_order_id,
  summary.work_order_code,
  summary.work_order_type,
  summary.work_order_created_at,
  summary.work_order_updated_at,
  summary.quote_id,
  summary.main_equipment_id,
  summary.total_associations,
  summary.primary_count,
  summary.additional_count,
  summary.active_checks,
  summary.check_created,
  summary.pending_template,
  summary.not_applicable,
  summary.missing,
  summary.duplicates,
  summary.other,
  null::uuid as equipment_id,
  null::text as equipment_code,
  null::text as equipment_name,
  null::text as equipment_type,
  null::text as relation_found_by,
  null::boolean as is_primary,
  null::text as link_check_status,
  null::text as link_check_message,
  null::bigint as check_count,
  null::uuid as check_id,
  null::uuid as template_id,
  null::text as check_status,
  null::uuid as resolved_template_id,
  null::text as final_classification,
  null::text as historical_classification
from part_summary summary
union all
select
  'DETAIL', detail.work_order_id, detail.work_order_code, detail.work_order_type, detail.work_order_created_at, detail.work_order_updated_at, detail.quote_id, detail.main_equipment_id,
  null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint,
  detail.equipment_id, detail.equipment_code, detail.equipment_name, detail.equipment_type, detail.relation_found_by, detail.is_primary, detail.link_check_status, detail.link_check_message,
  detail.check_count, detail.check_id, detail.template_id, detail.check_status, detail.resolved_template_id, detail.final_classification, detail.historical_classification
from classified detail
union all
select
  'TYPE_SUMMARY', types.work_order_id, target.code, target.type, target.created_at, target.updated_at, target.quote_id, target.main_equipment_id,
  null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint, null::bigint,
  null::uuid, null::text, null::text, types.equipment_type, null::text, null::boolean, null::text, null::text, types.equipment_count, null::uuid, null::uuid, null::text, null::uuid, null::text, null::text
from type_summary types
join target on target.id = types.work_order_id
)
select c.*
from combined c
order by case c.row_kind when 'SUMMARY' then 1 when 'DETAIL' then 2 when 'TYPE_SUMMARY' then 3 else 4 end,
         c.equipment_type nulls first, c.equipment_code nulls first, c.equipment_id nulls first;
