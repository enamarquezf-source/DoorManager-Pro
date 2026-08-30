-- Read-only preflight for 095. No RPC is invoked and no data is mutated.
-- One homogeneous result set is returned.
with checks(check_group, check_name, observed_value, result) as (
  select 'baseline', '094 objects and submit guard',
         concat(to_regprocedure('public.dmp_submit_work_order_material(jsonb)'), '; ',
                (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'work_order_materials' and column_name = 'stock_validation_status'), '; ',
                (pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~* 'stock: el material no tiene apertura en el almacen indicado')),
         case when to_regprocedure('public.dmp_submit_work_order_material(jsonb)') is not null
                    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'work_order_materials' and column_name = 'stock_validation_status') = 1
                    and pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~* 'stock: el material no tiene apertura en el almacen indicado'
              then 'OK / 094 applied and known premature guard present' else 'BLOCKER' end
  union all
  select '094 columns', x.column_name, count(c.column_name)::text,
         case when count(c.column_name) = 1 then 'OK' else 'BLOCKER' end
  from (values
    ('stock_validation_status'), ('stock_warehouse_id'), ('stock_validated_at'),
    ('stock_validated_by'), ('stock_movement_id')
  ) as x(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = 'work_order_materials' and c.column_name = x.column_name
  group by x.column_name
  union all
  select '094 columns', x.column_name, count(c.column_name)::text,
         case when count(c.column_name) = 1 then 'OK' else 'BLOCKER' end
  from (values ('work_order_material_id'), ('idempotency_key')) as x(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = 'stock_movements' and c.column_name = x.column_name
  group by x.column_name
  union all
  select 'rpc', 'dmp_validate_work_order_material(uuid)',
         coalesce(to_regprocedure('public.dmp_validate_work_order_material(uuid)')::text, 'MISSING'),
         case when to_regprocedure('public.dmp_validate_work_order_material(uuid)') is not null then 'OK' else 'BLOCKER' end
  union all
  select 'rpc', 'dmp_submit_work_order_material(jsonb) security/search_path',
         concat('security_definer=', p.prosecdef, '; ', coalesce(array_to_string(p.proconfig, ','), 'default')),
         case when p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%' then 'OK' else 'BLOCKER' end
  from pg_proc p where p.oid = to_regprocedure('public.dmp_submit_work_order_material(jsonb)')
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
