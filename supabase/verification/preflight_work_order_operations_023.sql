-- Preflight 023 - horas, materiales, estado directo y borrado controlado
-- Ejecutar antes de aplicar supabase/migrations/023_work_order_operations_and_controlled_delete.sql.

select 'required_base_tables_023' as check_name, table_name, count(*) as present
from information_schema.tables
where table_schema = 'public'
  and table_name = any(array['work_orders','work_order_materials','work_order_status_history','audit_log','activity_log','profiles','materials','corrective_actions','files'])
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

select 'indexes_before_023' as check_name,
       schemaname,
       tablename,
       indexname,
       indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = any(array['work_order_materials','work_orders','checks','deficiencies'])
order by tablename, indexname;

select 'foreign_keys_to_operational_entities_before_023' as check_name,
       conrelid::regclass::text as source_table,
       conname,
       confrelid::regclass::text as target_table,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid = any(array['public.work_orders'::regclass,'public.checks'::regclass,'public.deficiencies'::regclass])
order by target_table, source_table, conname;

select 'deficiency_fk_classification_before_023' as check_name,
       conrelid::regclass::text as source_table,
       conname,
       case when conrelid = 'public.corrective_actions'::regclass and pg_get_constraintdef(oid) ilike '%(deficiency_id)%' then 'cascade_child'
            else 'blocking_unclassified'
       end as classification,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid = 'public.deficiencies'::regclass
order by classification, source_table, conname;

select 'file_fk_classification_before_023' as check_name,
       conrelid::regclass::text as source_table,
       conname,
       'reference_checked_before_queue' as classification,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid = 'public.files'::regclass
order by source_table, conname;

select 'local_change_collisions_before_023' as check_name,
       company_id,
       local_change_id,
       count(*) as rows,
       count(distinct work_order_id) as work_orders
from public.work_order_materials
where local_change_id is not null
group by company_id, local_change_id
having count(distinct work_order_id) > 1
order by rows desc;

select 'legacy_company_local_change_index_before_023' as check_name,
       indexname,
       indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'work_order_materials'
  and indexname = 'work_order_materials_company_local_change_unique';

select 'commercial_sat_work_order_exposure_before_023' as check_name,
       id,
       code,
       origin,
       company_id,
       created_by,
       current_responsible_id
from public.work_orders
where origin <> 'Comercial'
  and current_responsible_id in (select id from public.profiles where primary_area = 'Comercial')
order by created_at desc;

select 'cross_company_profile_or_material_before_023' as check_name,
       m.id,
       m.work_order_id,
       m.material_id,
       m.registered_by,
       m.company_id as usage_company_id,
       mat.company_id as material_company_id,
       p.company_id as profile_company_id
from public.work_order_materials m
left join public.materials mat on mat.id = m.material_id
left join public.profiles p on p.id = m.registered_by
where (mat.company_id is not null and mat.company_id <> m.company_id)
   or (p.company_id is not null and p.company_id <> m.company_id)
order by m.created_at desc;
