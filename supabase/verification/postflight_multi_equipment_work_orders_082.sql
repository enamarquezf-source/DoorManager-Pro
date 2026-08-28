-- READ-ONLY postflight for 082.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'work_order_equipment'
  and column_name in ('check_status', 'check_message')
order by column_name;

select count(*) as orphan_main_equipment_relationships
from public.work_orders wo
where wo.main_equipment_id is not null
  and not exists (select 1 from public.work_order_equipment woe where woe.work_order_id = wo.id and woe.equipment_id = wo.main_equipment_id);

select check_status, count(*)
from public.work_order_equipment
group by check_status
order by check_status;
