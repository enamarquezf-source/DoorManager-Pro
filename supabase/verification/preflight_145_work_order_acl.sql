-- DoorManager Pro - preflight read-only for migration 145.
-- Execute this file manually before applying 145.
-- It only reads PostgreSQL catalogs and rolls back its read-only transaction.

begin;
set transaction read only;

-- A. Relation identity, owner and RLS state.
select
  c.oid as table_oid,
  n.nspname as schema_name,
  c.relname as table_name,
  owner_role.rolname as owner_role,
  c.relacl as table_acl,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_roles owner_role on owner_role.oid = c.relowner
where c.oid = to_regclass('public.work_orders');

-- B. All real columns. attacl is the explicit column ACL only.
select
  a.attnum as column_number,
  a.attname as column_name,
  format_type(a.atttypid, a.atttypmod) as data_type,
  a.attnotnull as not_null,
  a.attacl as explicit_column_acl
from pg_attribute a
where a.attrelid = to_regclass('public.work_orders')
  and a.attnum > 0
  and not a.attisdropped
order by a.attnum;

-- C. Effective table UPDATE and explicit table UPDATE ACLs.
-- PUBLIC is represented by grantee_oid 0. It is not a login role.
with target_roles(role_name, role_oid, role_exists) as (
  values
    ('PUBLIC'::name, 0::oid, true),
    ('anon'::name, (select oid from pg_roles where rolname = 'anon'), exists (select 1 from pg_roles where rolname = 'anon')),
    ('authenticated'::name, (select oid from pg_roles where rolname = 'authenticated'), exists (select 1 from pg_roles where rolname = 'authenticated')),
    ('service_role'::name, (select oid from pg_roles where rolname = 'service_role'), exists (select 1 from pg_roles where rolname = 'service_role'))
), relation_acl as (
  select c.relacl as acl
  from pg_class c
  where c.oid = to_regclass('public.work_orders')
), relation_effective_acl as (
  select coalesce(c.relacl, acldefault('r', c.relowner)) as acl
  from pg_class c
  where c.oid = to_regclass('public.work_orders')
)
select
  roles.role_name,
  roles.role_exists,
  case
    when not roles.role_exists then null
    when roles.role_name = 'PUBLIC' then exists (
      select 1 from relation_effective_acl, lateral aclexplode(relation_effective_acl.acl) x
      where x.grantee = 0 and x.privilege_type = 'UPDATE'
    )
    else has_table_privilege(roles.role_name, 'public.work_orders', 'UPDATE')
  end as table_update_effective,
  exists (
    select 1
    from relation_acl, lateral aclexplode(relation_acl.acl) x
    where x.grantee = roles.role_oid
      and x.privilege_type = 'UPDATE'
  ) as table_update_explicit,
  exists (
    select 1
    from relation_acl, lateral aclexplode(relation_acl.acl) x
    where x.grantee = roles.role_oid
      and x.privilege_type = 'UPDATE'
      and x.is_grantable
  ) as table_update_grantable
from target_roles roles
order by case roles.role_name when 'PUBLIC' then 1 when 'anon' then 2 when 'authenticated' then 3 else 4 end;

-- D. Effective UPDATE columns and explicit column grants for every requested role.
with target_roles(role_name, role_oid, role_exists) as (
  values
    ('PUBLIC'::name, 0::oid, true),
    ('anon'::name, (select oid from pg_roles where rolname = 'anon'), exists (select 1 from pg_roles where rolname = 'anon')),
    ('authenticated'::name, (select oid from pg_roles where rolname = 'authenticated'), exists (select 1 from pg_roles where rolname = 'authenticated')),
    ('service_role'::name, (select oid from pg_roles where rolname = 'service_role'), exists (select 1 from pg_roles where rolname = 'service_role'))
), real_columns as (
  select a.attnum, a.attname, a.attacl
  from pg_attribute a
  where a.attrelid = to_regclass('public.work_orders')
    and a.attnum > 0
    and not a.attisdropped
), relation_acl as (
  select c.relacl as acl
  from pg_class c
  where c.oid = to_regclass('public.work_orders')
), relation_effective_acl as (
  select coalesce(c.relacl, acldefault('r', c.relowner)) as acl
  from pg_class c
  where c.oid = to_regclass('public.work_orders')
)
select
  roles.role_name,
  roles.role_exists,
  array_agg(columns.attname order by columns.attnum) filter (where
    case
      when not roles.role_exists then false
      when roles.role_name = 'PUBLIC' then
        exists (select 1 from relation_effective_acl, lateral aclexplode(relation_effective_acl.acl) x where x.grantee = 0 and x.privilege_type = 'UPDATE')
        or exists (select 1 from lateral aclexplode(columns.attacl) x where x.grantee = 0 and x.privilege_type = 'UPDATE')
      else has_column_privilege(roles.role_name, 'public.work_orders', columns.attname, 'UPDATE')
    end
  ) as effective_update_columns,
  array_agg(columns.attname order by columns.attnum) filter (where exists (
    select 1
    from lateral aclexplode(columns.attacl) x
    where x.grantee = roles.role_oid
      and x.privilege_type = 'UPDATE'
  )) as explicit_update_columns,
  array_agg(columns.attname order by columns.attnum) filter (where exists (
    select 1
    from lateral aclexplode(columns.attacl) x
    where x.grantee = roles.role_oid
      and x.privilege_type = 'UPDATE'
      and x.is_grantable
  )) as grantable_update_columns
from target_roles roles
cross join real_columns columns
group by roles.role_name, roles.role_oid, roles.role_exists
order by case roles.role_name when 'PUBLIC' then 1 when 'anon' then 2 when 'authenticated' then 3 else 4 end;

-- E. Per-column detail for every requested role. This makes legacy grants visible.
with target_roles(role_name, role_oid, role_exists) as (
  values
    ('PUBLIC'::name, 0::oid, true),
    ('anon'::name, (select oid from pg_roles where rolname = 'anon'), exists (select 1 from pg_roles where rolname = 'anon')),
    ('authenticated'::name, (select oid from pg_roles where rolname = 'authenticated'), exists (select 1 from pg_roles where rolname = 'authenticated')),
    ('service_role'::name, (select oid from pg_roles where rolname = 'service_role'), exists (select 1 from pg_roles where rolname = 'service_role'))
), relation_effective_acl as (
  select coalesce(c.relacl, acldefault('r', c.relowner)) as acl
  from pg_class c
  where c.oid = to_regclass('public.work_orders')
)
select
  roles.role_name,
  roles.role_exists,
  columns.attnum as column_number,
  columns.attname as column_name,
  case
    when not roles.role_exists then null
    when roles.role_name = 'PUBLIC' then
      exists (select 1 from relation_effective_acl, lateral aclexplode(relation_effective_acl.acl) x where x.grantee = 0 and x.privilege_type = 'UPDATE')
      or exists (select 1 from lateral aclexplode(columns.attacl) x where x.grantee = 0 and x.privilege_type = 'UPDATE')
    else has_column_privilege(roles.role_name, 'public.work_orders', columns.attname, 'UPDATE')
  end as update_effective,
  exists (
    select 1 from lateral aclexplode(columns.attacl) x
    where x.grantee = roles.role_oid and x.privilege_type = 'UPDATE'
  ) as update_explicit,
  exists (
    select 1 from lateral aclexplode(columns.attacl) x
    where x.grantee = roles.role_oid and x.privilege_type = 'UPDATE' and x.is_grantable
  ) as update_grantable
from target_roles roles
cross join lateral (
  select a.attnum, a.attname, a.attacl
  from pg_attribute a
  where a.attrelid = to_regclass('public.work_orders')
    and a.attnum > 0
    and not a.attisdropped
) columns
order by case roles.role_name when 'PUBLIC' then 1 when 'anon' then 2 when 'authenticated' then 3 else 4 end, columns.attnum;

-- F. service_role identity and role memberships. Memberships help explain
-- indirect privileges, but effective_* above remains the authority.
select
  exists (select 1 from pg_roles where rolname = 'service_role') as service_role_exists,
  (select oid from pg_roles where rolname = 'service_role') as service_role_oid,
  (select rolinherit from pg_roles where rolname = 'service_role') as service_role_inherit,
  (select rolbypassrls from pg_roles where rolname = 'service_role') as service_role_bypassrls,
  (select rolsuper from pg_roles where rolname = 'service_role') as service_role_superuser,
  (select rolcanlogin from pg_roles where rolname = 'service_role') as service_role_can_login,
  (select rolcreaterole from pg_roles where rolname = 'service_role') as service_role_can_create_role;

select
  member.rolname as member_role,
  granted.rolname as inherited_role,
  m.admin_option
from pg_auth_members m
join pg_roles member on member.oid = m.member
join pg_roles granted on granted.oid = m.roleid
where member.rolname in ('anon', 'authenticated', 'service_role')
   or granted.rolname in ('anon', 'authenticated', 'service_role')
order by member.rolname, granted.rolname;

-- F2. Recursive service_role memberships (including cycles), with the
-- server's effective inheritance decision. PUBLIC is reported separately.
with recursive membership(role_oid, path, depth) as (
  select r.oid, array[r.oid], 0
  from pg_roles r where r.rolname = 'service_role'
  union all
  select m.roleid, membership.path || m.roleid, membership.depth + 1
  from membership
  join pg_auth_members m on m.member = membership.role_oid
  where not m.roleid = any(membership.path)
), reachable as (
  select distinct on (role_oid) role_oid, path, depth
  from membership order by role_oid, depth, path
)
select r.rolname as reachable_role, reachable.depth, reachable.path,
       r.rolinherit,
       pg_has_role((select oid from pg_roles where rolname = 'service_role'), r.oid, 'USAGE') as automatically_inherited,
       pg_has_role((select oid from pg_roles where rolname = 'service_role'), r.oid, 'MEMBER') as member_settable
from reachable join pg_roles r on r.oid = reachable.role_oid
order by reachable.depth, r.rolname;

-- F3. Provenance of UPDATE from each ACL grantee. A table UPDATE implies
-- every real column; column grants are reported separately. This enumerates
-- PUBLIC, direct service_role and inherited grants rather than assuming that
-- effective UPDATE is a direct grant. Owner/superuser paths require manual review.
with service as (
  select oid, rolinherit, rolsuper from pg_roles where rolname = 'service_role'
), target as (
  select c.oid, c.relowner, coalesce(c.relacl, acldefault('r', c.relowner)) as table_acl
  from pg_class c where c.oid = to_regclass('public.work_orders')
), grants as (
  select 'TABLE'::text as grant_scope, null::text as column_name, x.grantee, x.is_grantable
  from target t cross join lateral aclexplode(t.table_acl) x
  where x.privilege_type = 'UPDATE'
  union all
  select 'COLUMN', a.attname, x.grantee, x.is_grantable
  from target t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  cross join lateral aclexplode(a.attacl) x
  where x.privilege_type = 'UPDATE'
)
select g.grant_scope, g.column_name, g.grantee,
       case when g.grantee = 0 then 'PUBLIC' else coalesce(r.rolname, 'ROLE_MISSING:' || g.grantee::text) end as grantee_name,
       g.is_grantable, g.grantee = 0 as public_contribution,
       g.grantee = s.oid as direct_service_role_contribution,
       case when s.oid is null or g.grantee = 0 or g.grantee = s.oid then false
            when r.oid is null then null
            else pg_has_role(s.oid, g.grantee, 'USAGE') end as inherited_role_contribution,
       s.rolinherit as service_role_inherit, s.rolsuper as service_role_superuser,
       s.oid = (select relowner from target) as service_role_is_table_owner
from grants g cross join service s left join pg_roles r on r.oid = g.grantee
order by g.grant_scope, g.column_name nulls first, grantee_name;

-- G. Every UPDATE or ALL policy, including PUBLIC (OID 0) and missing roles.
select
  p.polname as policy_name,
  p.polcmd as policy_command,
  case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as policy_mode,
  policy_roles.role_oids,
  policy_roles.role_names,
  policy_roles.missing_role_oids,
  pg_get_expr(p.polqual, p.polrelid) as using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
from pg_policy p
cross join lateral (
  select array_agg(role_oid order by role_oid) as role_oids,
         array_agg(case when role_oid = 0 then 'PUBLIC' else coalesce(r.rolname, 'ROLE_MISSING:' || role_oid::text) end order by role_oid) as role_names,
         coalesce(array_agg(role_oid order by role_oid) filter (where role_oid <> 0 and r.oid is null), '{}'::oid[]) as missing_role_oids
  from unnest(p.polroles) policy_role(role_oid)
  left join pg_roles r on r.oid = policy_role.role_oid
) policy_roles
where p.polrelid = to_regclass('public.work_orders')
  and p.polcmd in ('w', '*')
order by p.polname;

-- H. Canonical RPC metadata and EXECUTE privileges. proconfig is shown
-- directly; no function source is returned.
with requested(signature, display_order) as (
  values
    ('public.dmp_change_work_order_status(uuid,text,text)', 1),
    ('public.dmp_finalize_work_order_technical(uuid,jsonb)', 2),
    ('public.dmp_review_work_order_sat(uuid,text,text,uuid,jsonb,text)', 3),
    ('public.dmp_review_work_order_office(uuid,text,text)', 4),
    ('public.request_work_order_return(uuid,uuid,text)', 5),
    ('public.change_work_order_status(uuid,text,uuid,text,boolean,numeric,numeric)', 6),
    ('public.dmp_archive_entity(text,uuid,text)', 7),
    ('public.dmp_restore_entity(text,uuid,text)', 8)
), resolved as (
  select requested.signature, requested.display_order, to_regprocedure(requested.signature) as procedure_oid
  from requested
)
select
  resolved.signature,
  resolved.procedure_oid is not null as exists,
  case when p.oid is null then null else p.prosecdef end as security_definer,
  case when p.oid is null then null else owner_role.rolname end as owner_role,
  case when p.oid is null then null else owner_role.oid is not null end as owner_exists,
  case when p.oid is null or owner_role.oid is null then null
       else has_table_privilege(owner_role.oid, 'public.work_orders', 'UPDATE') end as owner_effective_table_update,
  case when p.oid is null then null else p.proconfig end as proconfig,
  case when p.oid is null then null else exists (
    select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg = 'search_path=public'
  ) end as search_path_public,
  case when p.oid is null or not exists (select 1 from pg_roles where rolname = 'authenticated') then null
       else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as execute_authenticated,
  case when p.oid is null or not exists (select 1 from pg_roles where rolname = 'anon') then null
       else has_function_privilege('anon', p.oid, 'EXECUTE') end as execute_anon,
  case when p.oid is null then null else exists (
    select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
    where x.grantee = 0 and x.privilege_type = 'EXECUTE'
  ) end as execute_public_effective,
  case when p.oid is null then null else exists (
    select 1 from aclexplode(p.proacl) x
    where x.grantee = 0 and x.privilege_type = 'EXECUTE'
  ) end as execute_public_explicit,
  case when p.oid is null or not exists (select 1 from pg_roles where rolname = 'service_role') then null
       else has_function_privilege('service_role', p.oid, 'EXECUTE') end as execute_service_role
from resolved
left join pg_proc p on p.oid = resolved.procedure_oid
left join pg_roles owner_role on owner_role.oid = p.proowner
order by resolved.display_order;

rollback;
