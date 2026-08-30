-- Read-only postflight for 097. No RPC is invoked and no data is mutated.
-- One homogeneous result set is returned.
with checks(check_group, check_name, observed_value, result) as (
  select 'rpc', 'batch signature', coalesce(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')::text, 'MISSING'),
         case when to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)') is not null then 'OK' else 'BLOCKER' end
  union all
  select 'security', 'definer and search_path',
         concat('security_definer=', p.prosecdef, '; ', coalesce(array_to_string(p.proconfig, ','), 'default')),
         case when p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%' then 'OK' else 'BLOCKER' end
  from pg_proc p where p.oid = to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')
  union all
  select 'grants', 'authenticated/public/anon',
         concat('authenticated=', has_function_privilege('authenticated', 'public.dmp_set_initial_warehouse_stock_batch(jsonb)', 'EXECUTE'),
                '; public=', has_function_privilege('public', 'public.dmp_set_initial_warehouse_stock_batch(jsonb)', 'EXECUTE'),
                '; anon=', has_function_privilege('anon', 'public.dmp_set_initial_warehouse_stock_batch(jsonb)', 'EXECUTE')),
         case when has_function_privilege('authenticated', 'public.dmp_set_initial_warehouse_stock_batch(jsonb)', 'EXECUTE')
                    and not has_function_privilege('public', 'public.dmp_set_initial_warehouse_stock_batch(jsonb)', 'EXECUTE')
                    and not has_function_privilege('anon', 'public.dmp_set_initial_warehouse_stock_batch(jsonb)', 'EXECUTE') then 'OK' else 'BLOCKER' end
  union all
  select 'role_guard', 'SAT/Oficina/Gerencia/superadmin only',
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]$$
                   and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) !~* 'Tecnico|Comercial'
              then 'approved roles; technical/commercial absent' else 'guard missing or expanded' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]$$
                   and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) !~* 'Tecnico|Comercial' then 'OK' else 'BLOCKER' end
  union all
  select 'atomicity', 'json items, idempotency and movement boundary',
         concat('recordset=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'jsonb_to_recordset',
                '; advisory_lock=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'pg_advisory_xact_lock',
                '; warehouse_insert=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'insert into public.warehouse_stock',
                '; movement_insert=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'insert into public.stock_movements'),
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'jsonb_to_recordset'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'pg_advisory_xact_lock'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'insert into public.warehouse_stock'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'insert into public.stock_movements'
              then 'OK' else 'BLOCKER' end
  union all
  select 'safety', 'legacy/purchases/reservations untouched',
         concat('legacy_update=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'update public.materials',
                '; purchase=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'purchase|supplier|receipt|reservation'),
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) !~* 'update public.materials'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) !~* 'purchase|supplier|receipt|reservation' then 'OK' else 'BLOCKER' end
  union all
  select 'tenant', 'warehouse/material company guards',
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'current_company_id'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'company_id = v_warehouse.company_id'
              then 'warehouse and material scoped to current company' else 'guard not visible' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'current_company_id'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock_batch(jsonb)')) ~* 'company_id = v_warehouse.company_id' then 'OK' else 'BLOCKER' end
  union all
  select 'duplicates', 'warehouse_stock duplicate rows', coalesce(sum(n - 1), 0)::text,
         case when coalesce(sum(n - 1), 0) = 0 then 'OK' else 'BLOCKER' end
  from (select count(*) n from public.warehouse_stock group by warehouse_id, material_id having count(*) > 1) d
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
