-- READ-ONLY preflight for 084.
with checks as (
  select 'rpc_signature' as check_name,
         case when to_regprocedure('public.create_work_order_full(jsonb)') is not null then 'OK' else 'BLOCKER' end as status,
         coalesce(to_regprocedure('public.create_work_order_full(jsonb)')::text, 'missing') as detail
  union all
  select 'bridge_table', case when to_regclass('public.work_order_equipment') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regclass('public.work_order_equipment')::text, 'missing')
  union all
  select 'equipment_table', case when to_regclass('public.equipment') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regclass('public.equipment')::text, 'missing')
  union all
  select 'checks_table', case when to_regclass('public.checks') is not null then 'OK' else 'BLOCKER' end, coalesce(to_regclass('public.checks')::text, 'missing')
  union all
  select 'bridge_columns', case when count(*) = 4 then 'OK' else 'REVIEW' end, string_agg(column_name, ', ' order by column_name)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'work_order_equipment'
    and column_name in ('company_id', 'work_order_id', 'equipment_id', 'is_primary')
)
select * from checks order by check_name;

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.work_orders'::regclass, 'public.equipment'::regclass, 'public.work_order_equipment'::regclass, 'public.checks'::regclass)
order by conrelid::text, conname;

select count(*) as quote_case_mismatches
from public.work_orders wo
join public.quotes q on q.id = wo.quote_id
where wo.deleted_at is null and q.deleted_at is null
  and q.case_id is not null and wo.case_id is distinct from q.case_id;
