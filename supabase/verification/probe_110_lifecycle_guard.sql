with target as (
  select to_regclass('public.material_stock_movements') as table_oid
), known as (
  select * from (values
    ('dmp_lifecycle_dependencies(text,uuid)', to_regprocedure('public.dmp_lifecycle_dependencies(text,uuid)')),
    ('dmp_lifecycle_delete_plan(text,uuid)', to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)')),
    ('dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)', to_regprocedure('public.dmp_purge_entity_with_cleanup(text,uuid,text,text,jsonb,boolean,boolean)')),
    ('dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)', to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)'))
  ) as x(signature, routine_oid)
), routines as materialized (
  select p.oid,
         ns.nspname || '.' || p.proname as routine_name,
         pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind in ('f', 'p')
), legacy_routines as (
  select r.*
  from routines r
  where position('material_stock_movements' in lower(r.definition)) > 0
), known_status as (
  select k.signature,
         k.routine_oid is not null as present,
         exists (select 1 from legacy_routines r where r.oid = k.routine_oid) as has_legacy_ref
  from known k
), external_dependencies as (
  select d.classid, d.objid, d.deptype
  from pg_depend d
  cross join target t
  where t.table_oid is not null
    and d.refobjid = t.table_oid
    and d.deptype = 'n'
    and not (
      (d.classid = 'pg_class'::regclass and (d.objid = t.table_oid or exists (select 1 from pg_index i where i.indexrelid = d.objid and i.indrelid = t.table_oid)))
      or (d.classid = 'pg_constraint'::regclass and exists (select 1 from pg_constraint c where c.oid = d.objid and c.conrelid = t.table_oid))
      or (d.classid = 'pg_attrdef'::regclass and exists (select 1 from pg_attrdef a where a.oid = d.objid and a.adrelid = t.table_oid))
      or (d.classid = 'pg_trigger'::regclass and exists (select 1 from pg_trigger tr where tr.oid = d.objid and tr.tgrelid = t.table_oid))
      or (d.classid = 'pg_policy'::regclass and exists (select 1 from pg_policy pol where pol.oid = d.objid and pol.polrelid = t.table_oid))
      or (d.classid = 'pg_type'::regclass and exists (select 1 from pg_class c where c.oid = t.table_oid and c.reltype = d.objid))
    )
), raw_checks(check_name, observed, expected, detail) as (
  select 'legacy_table_present', to_jsonb(to_regclass('public.material_stock_movements') is not null), to_jsonb(true), 'PRE-110 requires the legacy table to exist'
  union all select 'legacy_rows_zero', to_jsonb(not exists (select 1 from public.material_stock_movements)), to_jsonb(true), 'PRE-110 requires historical rows to be cleared'
  union all select 'known_legacy_functions',
    to_jsonb((select bool_and(present and has_legacy_ref) from known_status)),
    to_jsonb(true),
    coalesce((select jsonb_agg(jsonb_build_object('signature', signature, 'present', present, 'has_legacy_ref', has_legacy_ref) order by signature)::text from known_status), '[]')
  union all select 'unexpected_runtime_legacy_refs',
    to_jsonb((select count(*)::bigint from legacy_routines r where not exists (select 1 from known k where k.routine_oid = r.oid))),
    to_jsonb(0),
    'no public function or procedure outside the four known signatures may reference the legacy table'
  union all select 'stock_movements_quote_id_absent',
    to_jsonb(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'quote_id')),
    to_jsonb(true),
    'canonical stock ledger must not expose a direct quote_id'
  union all select 'unknown_external_catalog_dependencies',
    to_jsonb((select count(*)::bigint from external_dependencies)),
    to_jsonb(0),
    'views, incoming FKs, external triggers and other normal dependencies must be zero'
), checks as (
  select check_name, observed, expected, observed = expected as passed, detail
  from raw_checks
)
select jsonb_build_object(
  'phase', 'PRE-110',
  'ok', bool_and(passed),
  'checks', jsonb_agg(jsonb_build_object('name', check_name, 'observed', observed, 'expected', expected, 'passed', passed, 'detail', detail) order by check_name)
) from checks;
