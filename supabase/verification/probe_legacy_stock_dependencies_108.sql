with target as (
  select a.attrelid, a.attnum
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'materials'
    and a.attname = 'stock_quantity'
    and not a.attisdropped
), functions as materialized (
  select p.oid,
         p.prokind,
         ns.nspname || '.' || p.proname as object_name,
         pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prokind in ('f', 'p')
), function_dependencies as (
  select 'function_text_reference'::text as dependency_source,
         case when fn.prokind = 'p' then 'procedure' else 'function' end::text as object_type,
         fn.object_name::text,
         fn.oid::text as object_id,
         'text_match'::text as dependency_kind,
         fn.definition::text
  from functions fn
  where fn.definition ~* 'stock_quantity'
), view_dependencies as (
  select 'direct_catalog_dependency'::text as dependency_source,
         case when view_class.relkind = 'm' then 'materialized_view' else 'view' end::text as object_type,
         (view_ns.nspname || '.' || view_class.relname)::text as object_name,
         view_class.oid::text as object_id,
         d.deptype::text as dependency_kind,
         pg_get_viewdef(view_class.oid, true)::text as definition
  from pg_depend d
  join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
  join pg_rewrite view_rule on d.classid = 'pg_rewrite'::regclass and view_rule.oid = d.objid
  join pg_class view_class on view_class.oid = view_rule.ev_class and view_class.relkind in ('v', 'm')
  join pg_namespace view_ns on view_ns.oid = view_class.relnamespace
), trigger_dependencies as (
  select 'direct_catalog_dependency'::text as dependency_source,
         'trigger'::text as object_type,
         (trigger_ns.nspname || '.' || trigger_class.relname || ':' || trigger_def.tgname)::text as object_name,
         trigger_def.oid::text as object_id,
         d.deptype::text as dependency_kind,
         pg_get_triggerdef(trigger_def.oid)::text as definition
  from pg_depend d
  join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
  join pg_trigger trigger_def on d.classid = 'pg_trigger'::regclass and trigger_def.oid = d.objid
  join pg_class trigger_class on trigger_class.oid = trigger_def.tgrelid
  join pg_namespace trigger_ns on trigger_ns.oid = trigger_class.relnamespace
  where not trigger_def.tgisinternal
), constraint_dependencies as (
  select 'direct_catalog_dependency'::text as dependency_source,
         'constraint'::text as object_type,
         (constraint_ns.nspname || '.' || constraint_class.relname || ':' || constraint_def.conname)::text as object_name,
         constraint_def.oid::text as object_id,
         d.deptype::text as dependency_kind,
         pg_get_constraintdef(constraint_def.oid)::text as definition
  from pg_depend d
  join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
  join pg_constraint constraint_def on d.classid = 'pg_constraint'::regclass and constraint_def.oid = d.objid
  join pg_class constraint_class on constraint_class.oid = constraint_def.conrelid
  join pg_namespace constraint_ns on constraint_ns.oid = constraint_class.relnamespace
), expression_dependencies as (
  select 'direct_catalog_dependency'::text as dependency_source,
         case when column_def.attgenerated <> '' then 'generated_expression' else 'default_expression' end::text as object_type,
         (expression_ns.nspname || '.' || expression_class.relname || '.' || column_def.attname)::text as object_name,
         expression_default.oid::text as object_id,
         d.deptype::text as dependency_kind,
         pg_get_expr(expression_default.adbin, expression_default.adrelid)::text as definition
  from pg_depend d
  join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
  join pg_attrdef expression_default on d.classid = 'pg_attrdef'::regclass and expression_default.oid = d.objid
  join pg_attribute column_def on column_def.attrelid = expression_default.adrelid and column_def.attnum = expression_default.adnum
  join pg_class expression_class on expression_class.oid = expression_default.adrelid
  join pg_namespace expression_ns on expression_ns.oid = expression_class.relnamespace
), index_dependencies as (
  select 'direct_catalog_dependency'::text as dependency_source,
         'index'::text as object_type,
         (index_ns.nspname || '.' || index_class.relname)::text as object_name,
         index_class.oid::text as object_id,
         d.deptype::text as dependency_kind,
         pg_get_indexdef(index_class.oid)::text as definition
  from pg_depend d
  join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
  join pg_class index_class on d.classid = 'pg_class'::regclass and index_class.oid = d.objid and index_class.relkind in ('i', 'I')
  join pg_namespace index_ns on index_ns.oid = index_class.relnamespace
), other_catalog_dependencies as (
  select 'direct_catalog_dependency'::text as dependency_source,
         d.classid::regclass::text as object_type,
         d.objid::text as object_name,
         d.objid::text as object_id,
         d.deptype::text as dependency_kind,
         null::text as definition
  from pg_depend d
  join target t on d.refobjid = t.attrelid and d.refobjsubid = t.attnum
  where d.classid not in ('pg_rewrite'::regclass, 'pg_trigger'::regclass, 'pg_constraint'::regclass, 'pg_attrdef'::regclass)
    and not (d.classid = 'pg_class'::regclass and exists (
      select 1
      from pg_class index_class
      where index_class.oid = d.objid and index_class.relkind in ('i', 'I')
    ))
), dependencies as (
  select * from function_dependencies
  union all select * from view_dependencies
  union all select * from trigger_dependencies
  union all select * from constraint_dependencies
  union all select * from expression_dependencies
  union all select * from index_dependencies
  union all select * from other_catalog_dependencies
)
select jsonb_build_object(
  'column_present', exists (select 1 from target),
  'dependencies', coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', dependency_source,
        'type', object_type,
        'name', object_name,
        'object_id', object_id,
        'kind', dependency_kind,
        'definition', definition
      ) order by dependency_source, object_type, object_name, object_id
    ),
    '[]'::jsonb
  )
) from dependencies;
