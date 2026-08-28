-- READ-ONLY preflight for 082.
select to_regclass('public.work_order_equipment') as relation_table,
       to_regclass('public.work_orders') as work_orders_table,
       to_regclass('public.checks') as checks_table,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'work_order_equipment' and column_name = 'is_primary') as has_primary_column;

select count(*) as work_orders_with_main_equipment
from public.work_orders
where main_equipment_id is not null;

select count(*) as existing_relationships
from public.work_order_equipment;
