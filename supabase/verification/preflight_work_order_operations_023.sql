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

with local_change_column as (
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_order_materials'
      and column_name = 'local_change_id'
  ) as exists_column
), collisions as (
  select m.company_id::text as company_id,
         to_jsonb(m)->>'local_change_id' as local_change_value,
         count(*) as row_count,
         count(distinct m.work_order_id) as work_order_count
  from public.work_order_materials m
  cross join local_change_column c
  where c.exists_column
    and to_jsonb(m)->>'local_change_id' is not null
  group by m.company_id, to_jsonb(m)->>'local_change_id'
  having count(distinct m.work_order_id) > 1
)
select 'local_change_collisions_before_023' as check_name,
       'CHECK' as status,
       'local_change_id existe; revisar colisiones entre partes' as detail,
       company_id,
       local_change_value,
       row_count,
       work_order_count
from collisions
union all
select 'local_change_collisions_before_023' as check_name,
       'NOT_APPLICABLE' as status,
       'local_change_id todavia no existe' as detail,
       null::text as company_id,
       null::text as local_change_value,
       0::bigint as row_count,
       0::bigint as work_order_count
from local_change_column
where not exists_column
order by row_count desc;

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

with registered_by_column as (
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_order_materials'
      and column_name = 'registered_by'
  ) as exists_column
), mismatches as (
  select m.id::text as usage_id,
         m.work_order_id::text as work_order_id,
         m.material_id::text as material_id,
         to_jsonb(m)->>'registered_by' as registered_by_value,
         m.company_id::text as usage_company_id,
         mat.company_id::text as material_company_id,
         p.company_id::text as profile_company_id,
         case when not c.exists_column then 'registered_by todavia no existe; se omite validacion de perfil'
              else 'registered_by existe; revisar material/perfil de otra empresa'
         end as detail,
         m.created_at
  from public.work_order_materials m
  cross join registered_by_column c
  left join public.materials mat on mat.id = m.material_id
  left join public.profiles p on c.exists_column and p.id = nullif(to_jsonb(m)->>'registered_by', '')::uuid
  where (mat.company_id is not null and mat.company_id <> m.company_id)
     or (c.exists_column and p.company_id is not null and p.company_id <> m.company_id)
)
select 'cross_company_profile_or_material_before_023' as check_name,
       case when (select exists_column from registered_by_column) then 'CHECK' else 'NOT_APPLICABLE' end as status,
       detail,
       usage_id,
       work_order_id,
       material_id,
       registered_by_value,
       usage_company_id,
       material_company_id,
       profile_company_id
from mismatches
union all
select 'cross_company_profile_or_material_before_023' as check_name,
       'NOT_APPLICABLE' as status,
       'registered_by todavia no existe' as detail,
       null::text as usage_id,
       null::text as work_order_id,
       null::text as material_id,
       null::text as registered_by_value,
       null::text as usage_company_id,
       null::text as material_company_id,
       null::text as profile_company_id
from registered_by_column
where not exists_column
order by usage_id desc;
