-- Read-only postflight for 096. No RPC is invoked and no data is mutated.
-- One homogeneous result set is returned.
with checks(check_group, check_name, observed_value, result) as (
  select 'role_guard', 'SAT and approved roles',
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]$$
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) !~* $$array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\].*Tecnico|array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\].*Comercial$$ then 'SAT,Oficina,Gerencia,superadmin; Tecnico/Comercial absent' else 'guard not found or role expanded' end,
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* $$has_any_role\s*\(\s*array\['superadmin'\s*,\s*'SAT'\s*,\s*'Gerencia'\s*,\s*'Oficina'\s*\]$$ then 'OK' else 'BLOCKER' end
  union all
  select 'logic', 'opening validations and audit',
         concat('tenant=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* 'current_company_id',
                '; quantity=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* 'p_quantity',
                '; reason=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* 'p_reason',
                '; movement=', pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* 'stock_movements'),
         case when pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* 'current_company_id'
                    and pg_get_functiondef(to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')) ~* 'stock_movements' then 'OK' else 'BLOCKER' end
  union all
  select 'security', 'definer and search_path',
         concat('security_definer=', p.prosecdef, '; ', coalesce(array_to_string(p.proconfig, ','), 'default')),
         case when p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public%' then 'OK' else 'BLOCKER' end
  from pg_proc p where p.oid = to_regprocedure('public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)')
  union all
  select 'grants', 'authenticated/public/anon',
         concat('authenticated=', has_function_privilege('authenticated', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', 'EXECUTE'),
                '; public=', has_function_privilege('public', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', 'EXECUTE'),
                '; anon=', has_function_privilege('anon', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', 'EXECUTE')),
         case when has_function_privilege('authenticated', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', 'EXECUTE')
                    and not has_function_privilege('public', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', 'EXECUTE')
                    and not has_function_privilege('anon', 'public.dmp_set_initial_warehouse_stock(uuid,uuid,numeric,text)', 'EXECUTE') then 'OK' else 'BLOCKER' end
)
select check_group, check_name, observed_value, result
from checks
order by check_group, check_name;
