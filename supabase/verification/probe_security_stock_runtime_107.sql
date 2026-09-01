with requested(proname, identity_arguments, expected_authenticated) as (
  values
    ('dmp_adjust_warehouse_stock', 'uuid, uuid, text, numeric, text, text', true),
    ('dmp_create_material_with_stock', 'jsonb', true),
    ('dmp_delete_work_order_material', 'uuid, text', true),
    ('dmp_refund_work_order_material_stock', 'uuid, uuid, text', false),
    ('dmp_purge_entity_with_cleanup', 'text, uuid, text, text, jsonb, boolean, boolean', true),
    ('dmp_apply_material_stock_movement', 'uuid, text, numeric, text, text, uuid, uuid, uuid, numeric, uuid', false),
    ('dmp_adjust_material_stock', 'uuid, text, numeric, text, numeric', false),
    ('dmp_validate_work_order_material', 'uuid', true)
), functions as (
  select r.proname, r.identity_arguments, r.expected_authenticated, p.oid, p.prosecdef, p.proconfig,
         pg_get_function_identity_arguments(p.oid) as installed_identity_arguments,
         case when p.oid is null then null else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_grant
  from requested r
  left join pg_proc p on p.pronamespace = 'public'::regnamespace
    and p.proname = r.proname
    and pg_get_function_identity_arguments(p.oid) = r.identity_arguments
), checks(check_name, passed, detail) as (
  select f.proname || '.exists', f.oid is not null,
    format('proname=%s identity_arguments=%s prosecdef=%s proconfig=%s grants_authenticated=%s', f.proname, coalesce(f.installed_identity_arguments, f.identity_arguments), f.prosecdef, f.proconfig, f.authenticated_grant)
  from functions f
  union all select f.proname || '.security_definer', coalesce(f.prosecdef, false), format('proname=%s identity_arguments=%s prosecdef=%s proconfig=%s grants_authenticated=%s', f.proname, coalesce(f.installed_identity_arguments, f.identity_arguments), f.prosecdef, f.proconfig, f.authenticated_grant) from functions f
  union all select f.proname || '.search_path_public', coalesce(exists (select 1 from unnest(coalesce(f.proconfig, array[]::text[])) as config where lower(config) = 'search_path=public'), false), format('proname=%s identity_arguments=%s prosecdef=%s proconfig=%s grants_authenticated=%s', f.proname, coalesce(f.installed_identity_arguments, f.identity_arguments), f.prosecdef, f.proconfig, f.authenticated_grant) from functions f
  union all select f.proname || '.grant_authenticated', coalesce(f.authenticated_grant = f.expected_authenticated, false), format('proname=%s identity_arguments=%s prosecdef=%s proconfig=%s grants_authenticated=%s expected_authenticated=%s', f.proname, coalesce(f.installed_identity_arguments, f.identity_arguments), f.prosecdef, f.proconfig, f.authenticated_grant, f.expected_authenticated) from functions f
)
select check_name, passed, detail from checks order by check_name;
