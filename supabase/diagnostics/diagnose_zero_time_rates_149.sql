-- Read-only diagnosis. Distinguishes actual zero snapshots from absent rates.
select w.code, e.id as time_entry_id, e.profile_id, e.work_date,
       e.duration_minutes / 60.0 as hours, e.hour_type,
       e.hourly_cost, e.hourly_price, e.total_cost, e.total_price,
       e.rate_id, e.rate_version_id, e.source, w.economic_review_status,
       case when e.rate_version_id is null then 'Sin version tarifaria vinculada'
            else 'Snapshot con version tarifaria' end as rate_evidence
from public.work_orders w
join public.work_order_time_entries e on e.work_order_id = w.id and e.company_id = w.company_id
where w.deleted_at is null
  and w.id = '70000000-0000-0000-0000-000000000002'::uuid
order by e.work_date, e.profile_id, e.id;
