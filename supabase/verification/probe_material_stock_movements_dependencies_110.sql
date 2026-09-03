with target as (
  select 'public.material_stock_movements'::regclass as oid
), routines as materialized (
  select p.oid, ns.nspname || '.' || p.proname as object_name, p.prokind, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind in ('f', 'p')
), catalog_dependencies as (
  select 'pg_depend'::text as dependency_source,
         d.classid::regclass::text as object_type,
         d.objid::text as object_name,
         d.objid::text as object_id,
         d.deptype::text as dependency_kind,
         'direct catalog dependency'::text as detail
  from pg_depend d
  join target t on d.refobjid = t.oid
), function_dependencies as (
  select 'function_text'::text as dependency_source,
         case when r.prokind = 'p' then 'procedure' else 'function' end::text as object_type,
         r.object_name::text,
         r.oid::text as object_id,
         'body_match'::text as dependency_kind,
         r.definition::text as detail
  from routines r
  where position('material_stock_movements' in lower(r.definition)) > 0
), view_dependencies as (
  select 'view'::text as dependency_source,
         case when c.relkind = 'm' then 'materialized_view' else 'view' end::text as object_type,
         ns.nspname || '.' || c.relname as object_name,
         c.oid::text as object_id,
         'pg_depend'::text as dependency_kind,
         pg_get_viewdef(c.oid, true)::text as detail
  from pg_depend d
  join target t on d.refobjid = t.oid
  join pg_rewrite rw on d.classid = 'pg_rewrite'::regclass and rw.oid = d.objid
  join pg_class c on c.oid = rw.ev_class and c.relkind in ('v', 'm')
  join pg_namespace ns on ns.oid = c.relnamespace
), trigger_dependencies as (
  select 'trigger'::text as dependency_source,
         'trigger'::text as object_type,
         ns.nspname || '.' || c.relname || ':' || tr.tgname as object_name,
         tr.oid::text as object_id,
         'pg_depend'::text as dependency_kind,
         pg_get_triggerdef(tr.oid)::text as detail
  from pg_depend d
  join target t on d.refobjid = t.oid
  join pg_trigger tr on d.classid = 'pg_trigger'::regclass and tr.oid = d.objid and not tr.tgisinternal
  join pg_class c on c.oid = tr.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
), constraint_dependencies as (
  select 'constraint'::text as dependency_source,
         'constraint'::text as object_type,
         ns.nspname || '.' || c.relname || ':' || con.conname as object_name,
         con.oid::text as object_id,
         'pg_depend'::text as dependency_kind,
         pg_get_constraintdef(con.oid)::text as detail
  from pg_depend d
  join target t on d.refobjid = t.oid
  join pg_constraint con on d.classid = 'pg_constraint'::regclass and con.oid = d.objid
  join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
), index_dependencies as (
  select 'index'::text as dependency_source,
         'index'::text as object_type,
         ns.nspname || '.' || c.relname as object_name,
         c.oid::text as object_id,
         'pg_depend'::text as dependency_kind,
         pg_get_indexdef(c.oid)::text as detail
  from pg_depend d
  join target t on d.refobjid = t.oid
  join pg_class c on d.classid = 'pg_class'::regclass and c.oid = d.objid and c.relkind in ('i', 'I')
  join pg_namespace ns on ns.oid = c.relnamespace
), foreign_key_dependencies as (
  select 'foreign_key'::text as dependency_source,
         'foreign_key'::text as object_type,
         ns.nspname || '.' || c.relname || ':' || con.conname as object_name,
         con.oid::text as object_id,
         'catalog_reference'::text as dependency_kind,
         pg_get_constraintdef(con.oid)::text as detail
  from pg_constraint con
  join target t on con.conrelid = t.oid or con.confrelid = t.oid
  join pg_class c on c.oid = con.conrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where con.contype = 'f'
), policy_dependencies as (
  select 'policy'::text as dependency_source,
         'policy'::text as object_type,
         schemaname || '.' || tablename || ':' || policyname as object_name,
         null::text as object_id,
         'pg_policies'::text as dependency_kind,
         coalesce(qual, '') || coalesce(' WITH CHECK ' || with_check, '') as detail
  from pg_policies
  where schemaname = 'public' and tablename = 'material_stock_movements'
), grant_dependencies as (
  select 'grant'::text as dependency_source,
         'table_privilege'::text as object_type,
         table_schema || '.' || table_name || ':' || grantee as object_name,
         null::text as object_id,
         privilege_type::text as dependency_kind,
         'table privilege'::text as detail
  from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'material_stock_movements'
), dependencies as (
  select * from catalog_dependencies
  union all select * from function_dependencies
  union all select * from view_dependencies
  union all select * from trigger_dependencies
  union all select * from constraint_dependencies
  union all select * from index_dependencies
  union all select * from foreign_key_dependencies
  union all select * from policy_dependencies
  union all select * from grant_dependencies
)
select jsonb_build_object(
  'table_present', to_regclass('public.material_stock_movements') is not null,
  'dependencies', coalesce(jsonb_agg(jsonb_build_object('source', dependency_source, 'type', object_type, 'name', object_name, 'object_id', object_id, 'kind', dependency_kind, 'detail', detail) order by dependency_source, object_type, object_name, object_id), '[]'::jsonb)
) from dependencies;
