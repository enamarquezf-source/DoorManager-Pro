-- Read-only postflight for 095. No RPC is invoked and no data is mutated.
-- One homogeneous result set is returned.
with checks(check_group, check_name, observed_value, result) as (
  select 'submit', 'no premature opening guard',
         case when pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~* 'warehouse_stock|el material no tiene apertura|stock insuficiente'
              then 'forbidden stock guard present' else 'no warehouse stock/opening/availability guard' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) !~* 'warehouse_stock|el material no tiene apertura|stock insuficiente' then 'OK' else 'BLOCKER' end
  union all
  select 'submit', 'pending without stock writes',
         concat('pending=', pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~ $$then 'pending' else 'validated' end$$,
                '; movement=', pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~* 'stock_movements',
                '; warehouse_update=', pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~* 'update public.warehouse_stock',
                '; material_stock_update=', pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~* 'update public.materials'),
         case when pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) ~ $$then 'pending' else 'validated' end$$
                    and pg_get_functiondef(to_regprocedure('public.dmp_submit_work_order_material(jsonb)')) !~* 'insert into public.stock_movements|update public.warehouse_stock|update public.materials'
              then 'OK' else 'BLOCKER' end
  union all
  select 'validate', 'stock guards retained',
         concat('warehouse_stock=', pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'warehouse_stock',
                '; opening=', pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'no existe saldo abierto',
                '; insufficient=', pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'stock insuficiente',
                '; movement=', pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'insert into public.stock_movements'),
         case when pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'warehouse_stock'
                    and pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'no existe saldo abierto'
                    and pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'stock insuficiente'
                    and pg_get_functiondef(to_regprocedure('public.dmp_validate_work_order_material(uuid)')) ~* 'insert into public.stock_movements'
              then 'OK' else 'BLOCKER' end
  union all
  select 'rpc', x.signature, coalesce(to_regprocedure(x.signature)::text, 'MISSING'),
         case when to_regprocedure(x.signature) is not null then 'OK' else 'BLOCKER' end
  from (values
    ('public.dmp_submit_work_order_material(jsonb)'),
    ('public.dmp_validate_work_order_material(uuid)')
  ) as x(signature)
  union all
  select 'security', x.signature,
         concat('security_definer=', p.prosecdef, '; search_path=', coalesce(array_to_string(p.proconfig, ','), 'default')),
         case when p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%' then 'OK' else 'BLOCKER' end
  from (values
    ('public.dmp_submit_work_order_material(jsonb)'),
    ('public.dmp_validate_work_order_material(uuid)')
  ) as x(signature)
  join pg_proc p on p.oid = to_regprocedure(x.signature)
  union all
  select 'grants', x.signature,
         concat('authenticated=', has_function_privilege('authenticated', x.signature, 'EXECUTE'),
                '; public=', has_function_privilege('public', x.signature, 'EXECUTE'),
                '; anon=', has_function_privilege('anon', x.signature, 'EXECUTE')),
         case when has_function_privilege('authenticated', x.signature, 'EXECUTE')
                    and not has_function_privilege('public', x.signature, 'EXECUTE')
                    and not has_function_privilege('anon', x.signature, 'EXECUTE') then 'OK' else 'BLOCKER' end
  from (values
    ('public.dmp_submit_work_order_material(jsonb)'),
    ('public.dmp_validate_work_order_material(uuid)')
  ) as x(signature)
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
