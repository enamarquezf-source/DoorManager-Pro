-- DMP: catálogo estructural para documentación. SOLO LECTURA.
-- No consulta registros de clientes, importes, contraseñas ni claves.
-- Ejecutar completo en el SQL Editor del proyecto DMP.
-- El resultado es una celda JSON llamada dmp_architecture_catalog.
with objects as (
  select c.oid, n.nspname as schema_name, c.relname as name, c.relkind,
         c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'auth', 'storage')
    and c.relkind in ('r','p','v','m')
), tables_json as (
  select jsonb_agg(jsonb_build_object(
    'schema', o.schema_name, 'name', o.name,
    'kind', case o.relkind when 'v' then 'view' when 'm' then 'materialized_view' else 'table' end,
    'rls_enabled', o.rls_enabled,
    'columns', coalesce((select jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid,a.atttypmod),
      'nullable', not a.attnotnull,
      'primary_key', exists(select 1 from pg_constraint p where p.conrelid=o.oid and p.contype='p' and a.attnum=any(p.conkey))
    ) order by a.attnum) from pg_attribute a where a.attrelid=o.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb)
  ) order by o.schema_name,o.name) as value from objects o
), foreign_keys_json as (
  select jsonb_agg(jsonb_build_object(
    'name', k.conname, 'from_schema', ns.nspname, 'from_table', s.relname,
    'from_columns', (select jsonb_agg(a.attname order by x.pos) from unnest(k.conkey) with ordinality x(num,pos) join pg_attribute a on a.attrelid=s.oid and a.attnum=x.num),
    'to_schema', nt.nspname, 'to_table', t.relname,
    'to_columns', (select jsonb_agg(a.attname order by x.pos) from unnest(k.confkey) with ordinality x(num,pos) join pg_attribute a on a.attrelid=t.oid and a.attnum=x.num),
    'definition', pg_get_constraintdef(k.oid)
  ) order by ns.nspname,s.relname,k.conname) as value
  from pg_constraint k
  join pg_class s on s.oid=k.conrelid join pg_namespace ns on ns.oid=s.relnamespace
  join pg_class t on t.oid=k.confrelid join pg_namespace nt on nt.oid=t.relnamespace
  where k.contype='f' and ns.nspname in ('public','auth','storage')
), triggers_json as (
  select jsonb_agg(jsonb_build_object('schema', n.nspname,'table',c.relname,'name',t.tgname,
    'function_schema',pn.nspname,'function',p.proname,'definition',pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname) as value
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
  where not t.tgisinternal and n.nspname in ('public','auth','storage')
), functions_json as (
  select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
    'arguments',pg_get_function_identity_arguments(p.oid),
    'returns',pg_get_function_result(p.oid),'security_definer',p.prosecdef) order by p.proname,p.oid) as value
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
), policies_json as (
  select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,
    'command',cmd,'roles',roles) order by tablename,policyname) as value
  from pg_policies where schemaname in ('public','auth','storage')
), view_links as (
  select distinct vn.nspname as view_schema,v.relname as view_name,tn.nspname as table_schema,t.relname as table_name
  from pg_rewrite r join pg_class v on v.oid=r.ev_class join pg_namespace vn on vn.oid=v.relnamespace
  join pg_depend d on d.objid=r.oid and d.classid='pg_rewrite'::regclass and d.refclassid='pg_class'::regclass
  join pg_class t on t.oid=d.refobjid join pg_namespace tn on tn.oid=t.relnamespace
  where v.relkind in ('v','m') and vn.nspname='public' and t.oid<>v.oid and t.relkind in ('r','p','v','m')
)
select jsonb_build_object(
  'source','live_pg_catalog', 'captured_at',current_timestamp,
  'tables_and_views',coalesce((select value from tables_json),'[]'::jsonb),
  'foreign_keys',coalesce((select value from foreign_keys_json),'[]'::jsonb),
  'triggers',coalesce((select value from triggers_json),'[]'::jsonb),
  'public_functions',coalesce((select value from functions_json),'[]'::jsonb),
  'policies',coalesce((select value from policies_json),'[]'::jsonb),
  'view_dependencies',coalesce((select jsonb_agg(to_jsonb(v)) from view_links v),'[]'::jsonb)
) as dmp_architecture_catalog;
