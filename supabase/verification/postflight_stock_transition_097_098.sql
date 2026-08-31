-- Read-only postflight for the functional 097/098 stock transition.
with
central as (
  select id, company_id
  from public.warehouses
  where code = 'ALM-CENTRAL' and deleted_at is null
),
expected_openings(code, quantity) as (
  values
    ('MAT-000001', 91::numeric), ('MAT-000002', 4::numeric), ('MAT-000003', 100::numeric),
    ('MAT-000004', 100::numeric), ('MAT-000005', 20::numeric), ('MAT-000006', 9::numeric),
    ('MAT-000007', 23::numeric), ('MAT-000008', 4::numeric), ('MAT-000009', 3::numeric),
    ('MAT-000011', 9::numeric), ('MAT-000014', 65::numeric), ('MAT-000016', 1::numeric),
    ('MAT-000021', 15::numeric), ('MAT-000022', 15::numeric), ('MAT-000026', 15::numeric)
),
expected_existing(code, canonical_quantity, legacy_quantity) as (
  values
    ('MAT-000010', 2::numeric, 3::numeric), ('MAT-CAB-001', 120::numeric, 275::numeric),
    ('MAT-CON-001', 3::numeric, 10::numeric), ('MAT-FOT-001', 6::numeric, 4::numeric)
),
expected_legacy(code, legacy_quantity) as (
  values
    ('MAT-000001', 91::numeric), ('MAT-000002', 4::numeric), ('MAT-000003', 100::numeric),
    ('MAT-000004', 100::numeric), ('MAT-000005', 20::numeric), ('MAT-000006', 9::numeric),
    ('MAT-000007', 23::numeric), ('MAT-000008', 4::numeric), ('MAT-000009', 3::numeric),
    ('MAT-000010', 3::numeric), ('MAT-000011', 9::numeric), ('MAT-000014', 65::numeric),
    ('MAT-000016', 1::numeric), ('MAT-000021', 15::numeric), ('MAT-000022', 15::numeric),
    ('MAT-000026', 15::numeric), ('MAT-CAB-001', 275::numeric), ('MAT-CON-001', 10::numeric),
    ('MAT-FOT-001', 4::numeric)
),
central_stock as (
  select ws.company_id, ws.warehouse_id, ws.material_id, ws.quantity
  from public.warehouse_stock ws
  join central c on c.id = ws.warehouse_id and c.company_id = ws.company_id
),
canonical_any as (
  select company_id, material_id, count(*)::bigint as warehouse_rows
  from public.warehouse_stock
  group by company_id, material_id
),
initial_ledger as (
  select sm.company_id, sm.warehouse_id, sm.material_id, count(*)::bigint as movement_rows,
         min(sm.quantity) as movement_quantity
  from public.stock_movements sm
  join central c on c.id = sm.warehouse_id and c.company_id = sm.company_id
  where sm.movement_type = 'Entrada' and sm.idempotency_key like 'initial-batch:%'
  group by sm.company_id, sm.warehouse_id, sm.material_id
),
known_reconciliations as (
  select r.*, m.code
  from public.warehouse_stock_reconciliations r
  join central c on c.id = r.warehouse_id and c.company_id = r.company_id
  join public.materials m on m.id = r.material_id and m.company_id = r.company_id
  join expected_existing e on e.code = m.code
),
reconciliation_movements as (
  select sm.company_id, sm.idempotency_key, count(*)::bigint as movement_rows,
         min(sm.movement_type) as movement_type, min(sm.quantity) as movement_quantity
  from public.stock_movements sm
  where sm.idempotency_key like 'canonical-reconciliation:%'
  group by sm.company_id, sm.idempotency_key
),
mat10_material_state as (
  select count(*)::bigint as material_rows,
         count(*) filter (where m.stock_quantity = 3)::bigint as legacy_rows
  from public.materials m
  join central c on c.company_id = m.company_id
  where m.code = 'MAT-000010' and m.deleted_at is null
),
mat10_canonical_state as (
  select count(*)::bigint as canonical_rows,
         count(*) filter (where cs.quantity = 2)::bigint as canonical_quantity_rows
  from central_stock cs
  join public.materials m on m.id = cs.material_id and m.company_id = cs.company_id
  where m.code = 'MAT-000010' and m.deleted_at is null
),
mat10_reconciliation_state as (
  select count(*)::bigint as reconciliation_rows,
         count(*) filter (where r.resolution in ('CANONICAL_CONFIRMED', 'CANONICAL_ADJUSTED')
                           and r.resolved_by is not null and r.resolved_at is not null
                           and r.reason <> '' and r.idempotency_key <> '')::bigint as valid_reconciliation_rows
  from known_reconciliations r
  where r.code = 'MAT-000010'
),
mat16_state as (
  select count(*)::bigint as material_rows,
         count(*) filter (where m.is_specific and m.active and m.stock_controlled and m.stock_quantity = 1)::bigint as valid_material_rows,
         count(*) filter (where cs.quantity = 1)::bigint as canonical_rows,
         count(*) filter (where il.movement_rows = 1)::bigint as opening_rows
  from public.materials m
  join central c on c.company_id = m.company_id
  left join central_stock cs on cs.company_id = m.company_id and cs.warehouse_id = c.id and cs.material_id = m.id
  left join initial_ledger il on il.company_id = m.company_id and il.warehouse_id = c.id and il.material_id = m.id
  where m.code = 'MAT-000016' and m.deleted_at is null
),
checks as (
  select 'CANONICAL'::text as check_group, 'central_warehouse_rows'::text as check_name,
         case when count(*) = 19 then 'OK' else 'BLOCKER' end as status,
         abs(count(*) - 19)::bigint as affected_rows,
         'ALM-CENTRAL warehouse_stock rows=' || count(*)::text || ', expected=19' as details
  from central_stock
  union all
  select 'OPENINGS', 'all_15_batch_openings_once',
         case when count(*) = 15 and count(*) filter (where coalesce(l.movement_rows, 0) = 1 and l.movement_quantity = e.quantity) = 15 then 'OK' else 'BLOCKER' end,
         (15 - count(*) filter (where coalesce(l.movement_rows, 0) = 1 and l.movement_quantity = e.quantity))::bigint,
         '15 expected materials have exactly one Entrada initial-batch movement with the confirmed quantity'
  from expected_openings e
  left join public.materials m on m.code = e.code and m.deleted_at is null
  left join central c on c.company_id = m.company_id
  left join initial_ledger l on l.company_id = m.company_id and l.warehouse_id = c.id and l.material_id = m.id
  union all
  select 'OPENINGS', 'initial_batch_duplicate_count',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::bigint,
         coalesce(string_agg(sm.material_id::text, ', '), 'none')
  from (
    select sm.company_id, sm.warehouse_id, sm.material_id
    from public.stock_movements sm
    where sm.movement_type = 'Entrada' and sm.idempotency_key like 'initial-batch:%'
    group by sm.company_id, sm.warehouse_id, sm.material_id
    having count(*) > 1
  ) sm
  union all
  select 'PREEXISTING', 'four_existing_canonical_quantities',
         case when count(*) = 4 and count(*) filter (where cs.quantity = e.canonical_quantity) = 4 then 'OK' else 'BLOCKER' end,
         (4 - count(*) filter (where cs.quantity = e.canonical_quantity))::bigint,
         'MAT-000010=2, MAT-CAB-001=120, MAT-CON-001=3, MAT-FOT-001=6'
  from expected_existing e
  left join public.materials m on m.code = e.code and m.deleted_at is null
  left join central c on c.company_id = m.company_id
  left join central_stock cs on cs.company_id = m.company_id and cs.warehouse_id = c.id and cs.material_id = m.id
  union all
  select 'PREEXISTING', 'no_initial_batch_for_four_existing',
         case when count(*) = 4 and count(*) filter (where coalesce(l.movement_rows, 0) = 0) = 4 then 'OK' else 'BLOCKER' end,
         (4 - count(*) filter (where coalesce(l.movement_rows, 0) = 0))::bigint,
         'Pre-existing canonical rows did not receive a second initial-batch opening'
  from expected_existing e
  left join public.materials m on m.code = e.code and m.deleted_at is null
  left join central c on c.company_id = m.company_id
  left join initial_ledger l on l.company_id = m.company_id and l.warehouse_id = c.id and l.material_id = m.id
  union all
  select 'RECONCILIATIONS', 'four_resolutions_complete',
         case when count(*) = 4 and count(*) filter (where resolved_by is not null and resolved_at is not null and reason <> '' and resolution is not null and idempotency_key <> '') = 4 then 'OK' else 'BLOCKER' end,
         (4 - count(*) filter (where resolved_by is not null and resolved_at is not null and reason <> '' and resolution is not null and idempotency_key <> ''))::bigint,
         coalesce(string_agg(code || '=' || resolution, ', ' order by code), 'none')
  from known_reconciliations
  union all
  select 'RECONCILIATIONS', 'no_extra_central_resolutions',
         case when count(*) = 4 then 'OK' else 'BLOCKER' end,
         abs(count(*) - 4)::bigint,
         'ALM-CENTRAL reconciliation rows=' || count(*)::text || ', expected=4'
  from public.warehouse_stock_reconciliations r
  join central c on c.id = r.warehouse_id and c.company_id = r.company_id
  union all
  select 'RECONCILIATIONS', 'idempotency_duplicates',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::bigint,
         coalesce(string_agg(company_id::text || ':' || idempotency_key, ', '), 'none')
  from (
    select company_id, idempotency_key
    from public.warehouse_stock_reconciliations
    group by company_id, idempotency_key
    having count(*) > 1
  ) d
  union all
  select 'RECONCILIATIONS', 'movement_semantics_derived_from_resolution',
         case when count(*) filter (where (r.delta = 0 and coalesce(mv.movement_rows, 0) = 0)
                                      or (r.delta <> 0 and mv.movement_rows = 1 and mv.movement_type = 'Ajuste' and mv.movement_quantity = abs(r.delta))) = 4 then 'OK' else 'BLOCKER' end,
          (4 - count(*) filter (where (r.delta = 0 and coalesce(mv.movement_rows, 0) = 0)
                                       or (r.delta <> 0 and mv.movement_rows = 1 and mv.movement_type = 'Ajuste' and mv.movement_quantity = abs(r.delta))))::bigint,
         'Accepted canonical rows require no movement; adjusted rows require exactly one Ajuste derived from delta'
  from known_reconciliations r
  left join reconciliation_movements mv on mv.company_id = r.company_id and mv.idempotency_key = 'canonical-reconciliation:' || r.idempotency_key
  union all
  select 'MAT-000010', 'legacy_canonical_reconciled',
         case when ms.material_rows = 1 and ms.legacy_rows = 1
                    and cs.canonical_rows = 1 and cs.canonical_quantity_rows = 1
                    and rs.reconciliation_rows = 1 and rs.valid_reconciliation_rows = 1 then 'OK' else 'BLOCKER' end,
         case when ms.material_rows = 1 and ms.legacy_rows = 1
                    and cs.canonical_rows = 1 and cs.canonical_quantity_rows = 1
                    and rs.reconciliation_rows = 1 and rs.valid_reconciliation_rows = 1 then 0 else 1 end::bigint,
         'material_rows=' || ms.material_rows || ', legacy_3=' || ms.legacy_rows || ', canonical_rows=' || cs.canonical_rows || ', canonical_2=' || cs.canonical_quantity_rows || ', reconciliations=' || rs.reconciliation_rows || ', valid=' || rs.valid_reconciliation_rows
  from mat10_material_state ms
  cross join mat10_canonical_state cs
  cross join mat10_reconciliation_state rs
  union all
  select 'ZERO_LEGACY', 'specific_zero_without_canonical_or_initial',
         case when count(*) = 10 and count(*) filter (where ca.material_id is not null) = 0 and count(*) filter (where il.material_id is not null) = 0 then 'OK' else 'REVIEW' end,
         (count(*) filter (where ca.material_id is not null or il.material_id is not null))::bigint,
         count(*)::text || ' specific materials with legacy zero; canonical/initial exceptions=' || (count(*) filter (where ca.material_id is not null or il.material_id is not null))::text
  from public.materials m
  left join canonical_any ca on ca.company_id = m.company_id and ca.material_id = m.id
  left join (select distinct company_id, material_id from public.stock_movements where movement_type = 'Entrada' and idempotency_key like 'initial-batch:%') il on il.company_id = m.company_id and il.material_id = m.id
  where m.deleted_at is null and m.is_specific = true and m.stock_quantity = 0
  union all
  select 'MAT-000016', 'specific_positive_opening',
         case when s.material_rows = 1 and s.valid_material_rows = 1 and s.canonical_rows = 1 and s.opening_rows = 1 then 'OK' else 'BLOCKER' end,
         case when s.material_rows = 1 and s.valid_material_rows = 1 and s.canonical_rows = 1 and s.opening_rows = 1 then 0 else 1 end::bigint,
         'MAT-000016 material_rows=' || s.material_rows || ', valid_material=' || s.valid_material_rows || ', canonical_rows=' || s.canonical_rows || ', opening_rows=' || s.opening_rows
  from mat16_state s
  union all
  select 'LEGACY', 'known_legacy_quantities_untouched',
         case when count(*) = 19 and count(*) filter (where m.stock_quantity = e.legacy_quantity) = 19 then 'OK' else 'BLOCKER' end,
         (19 - count(*) filter (where m.stock_quantity = e.legacy_quantity))::bigint,
         'Known legacy values remain unchanged for all 19 transitioned materials'
  from expected_legacy e
  left join public.materials m on m.code = e.code and m.deleted_at is null
  union all
  select 'LEDGER', 'idempotency_duplicates',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::bigint,
         coalesce(string_agg(company_id::text || ':' || idempotency_key, ', '), 'none')
  from (
    select company_id, idempotency_key
    from public.stock_movements
    where idempotency_key is not null
    group by company_id, idempotency_key
    having count(*) > 1
  ) d
  union all
  select 'LEDGER', 'orphan_warehouse_or_material',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::bigint,
         'stock_movements rows without a valid warehouse/material=' || count(*)::text
  from public.stock_movements sm
  left join public.warehouses w on w.id = sm.warehouse_id and w.company_id = sm.company_id
  left join public.materials m on m.id = sm.material_id and m.company_id = sm.company_id
  where w.id is null or m.id is null
  union all
  select 'LEDGER', 'positive_movement_quantities',
         case when count(*) = 0 then 'OK' else 'BLOCKER' end,
         count(*)::bigint,
         'stock_movements rows with quantity <= 0=' || count(*)::text
  from public.stock_movements
  where quantity <= 0
  union all
  select 'CONSUMPTION_094', 'mat000010_validated_consumption',
         case when count(*) = 1 and bool_and(stock_validation_status = 'validated') and bool_and(stock_movement_id is not null) and bool_and(stock_deducted_quantity = 1) then 'OK' else 'BLOCKER' end,
         case when count(*) = 1 and bool_and(stock_validation_status = 'validated') and bool_and(stock_movement_id is not null) and bool_and(stock_deducted_quantity = 1) then 0 else 1 end::bigint,
         'work_order_material 9d3fc8ef-1a24-4fb7-bb72-b11bdfb905da remains validated with deducted_quantity=1'
  from public.work_order_materials
  where id = '9d3fc8ef-1a24-4fb7-bb72-b11bdfb905da'::uuid
),
summary as (
  select 'SUMMARY'::text as check_group, 'BLOCKERS'::text as check_name,
         case when count(*) = 0 then 'OK' else 'BLOCKER' end as status,
         count(*)::bigint as affected_rows, 'blocker checks=' || count(*)::text as details
  from checks where status = 'BLOCKER'
  union all
  select 'SUMMARY', 'REVIEWS', case when count(*) = 0 then 'OK' else 'REVIEW' end, count(*)::bigint, 'review checks=' || count(*)::text from checks where status = 'REVIEW'
  union all
  select 'SUMMARY', 'OVERALL', case when count(*) filter (where status = 'BLOCKER') = 0 then 'OK' else 'BLOCKER' end, (count(*) filter (where status = 'BLOCKER'))::bigint, 'overall is OK when blockers=0' from checks
)
select check_group, check_name, status, affected_rows, details from checks
union all
select check_group, check_name, status, affected_rows, details from summary
order by check_group, check_name;
