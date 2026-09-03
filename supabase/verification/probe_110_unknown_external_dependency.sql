with target as (
  select to_regclass('public.material_stock_movements') as table_oid
), dependencies as (
  select d.classid, d.objid, d.refobjid, d.deptype
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
), objects as (
  select d.*,
         c.relkind,
         c.relnamespace as class_namespace,
         c.relname as class_name,
         ns.nspname as class_schema,
         con.contype,
         con.conrelid,
         con.confrelid,
         tr.tgrelid,
         tr.tgname,
         pol.polrelid,
         pr.prokind,
         pr.proname,
         pr.pronamespace,
         ty.typnamespace,
         ty.typname,
         rw.ev_class,
         vc.relkind as view_relkind,
         vc.relnamespace as view_namespace,
         vc.relname as view_name,
         vns.nspname as view_schema
  from dependencies d
  left join pg_class c on d.classid = 'pg_class'::regclass and c.oid = d.objid
  left join pg_namespace ns on ns.oid = c.relnamespace
  left join pg_constraint con on d.classid = 'pg_constraint'::regclass and con.oid = d.objid
  left join pg_trigger tr on d.classid = 'pg_trigger'::regclass and tr.oid = d.objid
  left join pg_policy pol on d.classid = 'pg_policy'::regclass and pol.oid = d.objid
  left join pg_proc pr on d.classid = 'pg_proc'::regclass and pr.oid = d.objid and pr.prokind in ('f', 'p')
  left join pg_type ty on d.classid = 'pg_type'::regclass and ty.oid = d.objid
  left join pg_rewrite rw on d.classid = 'pg_rewrite'::regclass and rw.oid = d.objid
  left join pg_class vc on vc.oid = rw.ev_class
  left join pg_namespace vns on vns.oid = vc.relnamespace
), classified as (
  select
    case
      when contype = 'f' and confrelid = refobjid then 'INCOMING FK'
      when classid = 'pg_rewrite'::regclass and view_relkind = 'v' then 'VIEW/RULE'
      when classid = 'pg_rewrite'::regclass and view_relkind = 'm' then 'MATERIALIZED VIEW/RULE'
      when classid = 'pg_trigger'::regclass and tgrelid is distinct from refobjid then 'TRIGGER EXTERNO'
      when classid = 'pg_policy'::regclass then 'POLICY EXTERNA'
      when classid = 'pg_proc'::regclass and prokind in ('f', 'p') then 'FUNCTION/PROCEDURE'
      when classid = 'pg_type'::regclass then 'TYPE'
      when classid = 'pg_class'::regclass and relkind = 'S' then 'SEQUENCE'
      else 'OTHER'
    end as dependency_type,
    case
      when contype = 'f' then conrelid
      when classid = 'pg_rewrite'::regclass then ev_class
      when classid = 'pg_trigger'::regclass then tgrelid
      when classid = 'pg_policy'::regclass then polrelid
      else objid
    end as dependent_oid,
    case
      when contype = 'f' then 'public'::name
      when classid = 'pg_rewrite'::regclass then view_schema
      when classid = 'pg_trigger'::regclass then (select n.nspname from pg_class tc join pg_namespace n on n.oid = tc.relnamespace where tc.oid = tgrelid)
      when classid = 'pg_policy'::regclass then (select n.nspname from pg_class pc join pg_namespace n on n.oid = pc.relnamespace where pc.oid = polrelid)
      when classid = 'pg_class'::regclass then class_schema
      when classid = 'pg_proc'::regclass then (select n.nspname from pg_namespace n where n.oid = pronamespace)
      when classid = 'pg_type'::regclass then (select n.nspname from pg_namespace n where n.oid = typnamespace)
      else null
    end as dependent_schema,
    case
      when contype = 'f' then (select c.relname from pg_class c where c.oid = conrelid) || ':' || (select conname from pg_constraint c where c.oid = objid)
      when classid = 'pg_rewrite'::regclass then view_name
      when classid = 'pg_trigger'::regclass then (select tc.relname from pg_class tc where tc.oid = tgrelid) || ':' || tgname
      when classid = 'pg_policy'::regclass then (select pc.relname from pg_class pc where pc.oid = polrelid) || ':' || (select polname from pg_policy p where p.oid = objid)
      when classid = 'pg_class'::regclass then class_name
      when classid = 'pg_proc'::regclass then proname
      when classid = 'pg_type'::regclass then typname
      else objid::text
    end as dependent_name,
    objid,
    refobjid,
    deptype,
    case
      when contype is not null then pg_get_constraintdef(objid)
      when classid = 'pg_rewrite'::regclass then pg_get_ruledef(objid)
      when classid = 'pg_trigger'::regclass then pg_get_triggerdef(objid)
      when classid = 'pg_proc'::regclass and prokind in ('f', 'p') then pg_get_functiondef(objid)
      when classid = 'pg_class'::regclass and relkind in ('i', 'I') then pg_get_indexdef(objid)
      when classid = 'pg_class'::regclass then format('relkind=%s', relkind)
      else classid::regclass::text
    end as detail
  from objects
)
select dependency_type,
       dependent_schema,
       dependent_name,
       dependent_oid,
       objid as dependency_object_oid,
       'public.material_stock_movements'::text as referenced_name,
       refobjid as referenced_oid,
       deptype as dependency_kind,
       detail
from classified
order by dependency_type, dependent_schema, dependent_name, dependent_oid;
