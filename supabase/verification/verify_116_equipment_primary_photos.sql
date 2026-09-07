-- 116 postflight. Solo SELECT; ejecutar despues de aplicar 116.

select a.attname, format_type(a.atttypid, a.atttypmod) as data_type,
       a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_expression
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.equipment_photos'::regclass
  and a.attname = 'is_primary' and not a.attisdropped;

select ix.indexrelid::regclass as index_name, ix.indisunique,
       pg_get_indexdef(ix.indexrelid, 1, true) as first_index_expression,
       pg_get_indexdef(ix.indexrelid, 0, true) as index_definition,
       pg_get_expr(ix.indpred, ix.indrelid) as predicate
from pg_index ix
join pg_class i on i.oid = ix.indexrelid
where ix.indexrelid = 'public.equipment_photos_one_primary_idx'::regclass;

select count(*) as equipment_with_multiple_primary
from (
  select equipment_id
  from public.equipment_photos
  where is_primary
  group by equipment_id
  having count(*) > 1
) duplicates;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'equipment_photos'
order by policyname;

select count(*) filter (where cmd = 'SELECT') as select_policies,
       count(*) filter (where cmd = 'INSERT') as insert_policies,
       count(*) filter (where cmd = 'UPDATE') as update_policies,
       count(*) filter (where cmd = 'DELETE') as delete_policies
from pg_policies
where schemaname = 'public' and tablename = 'equipment_photos';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('dmp_files_storage_select','dmp_files_storage_insert','dmp_files_storage_update')
order by policyname;

with expected(proname, expected_arg_count, expected_arg_type) as (
  values
    ('can_read_equipment_photo', 1, 'uuid'::regtype),
    ('can_manage_equipment_photo', 1, 'uuid'::regtype),
    ('can_read_dmp_storage_object', 1, 'text'::regtype),
    ('can_write_dmp_storage_object', 1, 'text'::regtype),
    ('dmp_register_equipment_photo', 1, 'jsonb'::regtype),
    ('dmp_set_equipment_primary_photo', 1, 'uuid'::regtype)
)
select e.proname, e.expected_arg_count, e.expected_arg_type,
       count(p.oid) as total_functions_with_name,
       coalesce(string_agg(p.oid::regprocedure::text, ' | ' order by p.oid), '') as found_signatures,
       count(p.oid) = 1 and bool_and(p.pronargs = e.expected_arg_count
         and p.proargtypes[0] = e.expected_arg_type::oid) as exact_single_signature
from expected e
left join pg_proc p on p.proname = e.proname
  and p.pronamespace = 'public'::regnamespace
  and p.prokind = 'f'
group by e.proname, e.expected_arg_count, e.expected_arg_type
order by e.proname;

select p.oid::regprocedure as signature,
       p.prosecdef,
       bool_or(c.setting = 'search_path=public') as search_path_public
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral unnest(coalesce(p.proconfig, array[]::text[])) c(setting) on true
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.proname in ('can_read_equipment_photo','can_manage_equipment_photo',
                    'can_read_dmp_storage_object','can_write_dmp_storage_object',
                    'dmp_register_equipment_photo','dmp_set_equipment_primary_photo')
group by p.oid
order by signature;

with target_functions as (
  select p.oid, p.proacl, p.proowner,
         p.proname,
         (select r.oid from pg_roles r where r.rolname = 'authenticated') as authenticated_oid
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f'
    and ((p.proname = 'dmp_register_equipment_photo' and p.pronargs = 1 and p.proargtypes[0] = 'jsonb'::regtype::oid)
      or (p.proname = 'dmp_set_equipment_primary_photo' and p.pronargs = 1 and p.proargtypes[0] = 'uuid'::regtype::oid))
)
select proname,
       coalesce((select bool_or(x.privilege_type = 'EXECUTE')
                 from aclexplode(coalesce(t.proacl, acldefault('f', t.proowner))) x
                 where x.grantee = 0), false) as public_execute,
       coalesce((select bool_or(x.privilege_type = 'EXECUTE')
                 from aclexplode(coalesce(t.proacl, acldefault('f', t.proowner))) x
                 where x.grantee = t.authenticated_oid), false) as authenticated_execute
from target_functions t
order by proname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'dmp-files';
