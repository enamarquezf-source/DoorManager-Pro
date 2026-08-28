-- READ-ONLY postflight for 084.
select case when to_regprocedure('public.create_work_order_full(jsonb)') is not null then 'OK' else 'BLOCKER' end as status,
       to_regprocedure('public.create_work_order_full(jsonb)')::text as rpc_signature;

select 'orphan_relationships' as check_name, count(*) as count,
       case when count(*) = 0 then 'OK' else 'BLOCKER' end as status
from public.work_order_equipment woe
left join public.work_orders wo on wo.id = woe.work_order_id
left join public.equipment e on e.id = woe.equipment_id
where wo.id is null or e.id is null or woe.company_id is distinct from wo.company_id or woe.company_id is distinct from e.company_id
union all
select 'duplicate_relationships', count(*), case when count(*) = 0 then 'OK' else 'BLOCKER' end
from (select work_order_id, equipment_id from public.work_order_equipment group by work_order_id, equipment_id having count(*) > 1) duplicates
union all
select 'incoherent_primary', count(*), case when count(*) = 0 then 'OK' else 'REVIEW' end
from public.work_orders wo
where wo.main_equipment_id is not null
  and not exists (select 1 from public.work_order_equipment woe where woe.work_order_id = wo.id and woe.equipment_id = wo.main_equipment_id and woe.is_primary)
union all
select 'quote_case_mismatches', count(*), case when count(*) = 0 then 'OK' else 'BLOCKER' end
from public.work_orders wo join public.quotes q on q.id = wo.quote_id
where wo.deleted_at is null and q.deleted_at is null and q.case_id is not null and wo.case_id is distinct from q.case_id
union all
select 'stock_side_effects_not_checked', 0, 'REVIEW'
union all
select 'invoice_side_effects_not_checked', 0, 'REVIEW'
union all
select 'payment_side_effects_not_checked', 0, 'REVIEW';

select woe.check_status, count(*)
from public.work_order_equipment woe
group by woe.check_status
order by woe.check_status;
