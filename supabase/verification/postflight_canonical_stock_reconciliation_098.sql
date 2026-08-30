-- Read-only postflight for canonical stock reconciliation 098.
with checks as (
  select 'table_and_columns' as check_name,
         case when count(*) = 12 then 'OK' else 'BLOCKER' end as status,
         count(*)::text || ' required reconciliation columns' as detail
  from information_schema.columns
  where table_schema = 'public' and table_name = 'warehouse_stock_reconciliations'
    and column_name in ('id','company_id','warehouse_id','material_id','resolution','previous_quantity','confirmed_quantity','delta','reason','resolved_by','resolved_at','idempotency_key')
  union all
  select 'rpc_signature', case when to_regprocedure('public.dmp_resolve_initial_stock_review(jsonb)') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regprocedure('public.dmp_resolve_initial_stock_review(jsonb)')::text, 'missing')
  union all
  select 'rpc_grants', case when has_function_privilege('authenticated','public.dmp_resolve_initial_stock_review(jsonb)','EXECUTE') and not has_function_privilege('anon','public.dmp_resolve_initial_stock_review(jsonb)','EXECUTE') then 'OK' else 'BLOCKER' end, 'authenticated only'
  union all
  select 'tenant_rls', case when c.relrowsecurity then 'OK' else 'BLOCKER' end, 'RLS enabled on reconciliation table'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'warehouse_stock_reconciliations'
  union all
  select 'audit_operation', case when pg_get_constraintdef(c.oid) like '%WAREHOUSE_STOCK_RECONCILE%' then 'OK' else 'BLOCKER' end, coalesce(pg_get_constraintdef(c.oid), 'missing operation constraint')
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'audit_log' and c.conname = 'audit_log_operation_check'
  union all
  select 'legacy_untouched', case when position('materials.stock_quantity' in lower(pg_get_functiondef(to_regprocedure('public.dmp_resolve_initial_stock_review(jsonb)')))) = 0 then 'OK' else 'BLOCKER' end, 'reconciliation RPC does not modify legacy stock'
)
select check_name, status, detail from checks order by check_name;
