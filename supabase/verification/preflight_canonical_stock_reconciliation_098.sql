-- Read-only preflight for canonical stock reconciliation 098.
with checks as (
  select 'table' as check_name, case when to_regclass('public.warehouse_stock_reconciliations') is null then 'OK' else 'BLOCKER' end as status, coalesce(to_regclass('public.warehouse_stock_reconciliations')::text, 'table absent before 098') as detail
  union all
  select 'rpc', case when to_regprocedure('public.dmp_resolve_initial_stock_review(jsonb)') is null then 'OK' else 'BLOCKER' end, coalesce(to_regprocedure('public.dmp_resolve_initial_stock_review(jsonb)')::text, 'rpc absent before 098')
  union all
  select 'canonical_stock', case when count(*) = 0 then 'OK' else 'REVIEW' end, count(*)::text || ' warehouse_stock rows are present and must remain untouched by preflight'
  from public.warehouse_stock
)
select check_name, status, detail from checks order by check_name;
