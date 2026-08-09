-- Preflight 023 - horas, materiales, estado directo y borrado controlado
-- Ejecutar antes de aplicar supabase/migrations/023_work_order_operations_and_controlled_delete.sql.

select 'required_base_tables_023' as check_name, table_name, count(*) as present
from information_schema.tables
where table_schema = 'public'
  and table_name = any(array['work_orders','work_order_materials','work_order_status_history','audit_log','activity_log','profiles','materials'])
group by table_name
order by table_name;

select 'work_order_materials_columns_before_023' as check_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'work_order_materials'
  and column_name = any(array['material_id','description','unit','registered_by','used_at','local_change_id','unit_price','used_quantity'])
order by ordinal_position;

select 'work_order_status_values_before_023' as check_name,
       check_clause
from information_schema.check_constraints
where constraint_schema = 'public'
  and check_clause ilike '%Devolucion solicitada%';

select 'critical_rpc_before_023' as check_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl), false) as public_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any(array['dmp_upsert_work_order_time_entry','dmp_delete_work_order_time_entry','dmp_upsert_work_order_material','dmp_delete_work_order_material','dmp_change_work_order_status','dmp_permanently_delete_entity'])
order by p.proname, arguments;
