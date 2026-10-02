-- DoorManager Pro - block direct client status mutation on work orders.
-- Generic authenticated edits retain only the explicit editable-column contract.
-- Canonical SECURITY DEFINER RPCs keep their owner privileges.
-- WAITING_FOR_REMOTE_PREFLIGHT: human must review ACL provenance before apply.
-- Never synthesize service_role grants from effective privileges. Abort the
-- transaction if removing client/PUBLIC grants would change its UPDATE access.

begin;

do $$
declare
  v_column text;
  v_service_role_had_table_update boolean := false;
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception '145: WAITING_FOR_REMOTE_PREFLIGHT - service_role missing';
  end if;
  create temporary table dmp145_service_role_update_columns(
    column_name text primary key
  ) on commit drop;

  select has_table_privilege('service_role', 'public.work_orders', 'UPDATE')
  into v_service_role_had_table_update;

  insert into dmp145_service_role_update_columns(column_name)
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.work_orders'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('service_role', 'public.work_orders', a.attname, 'UPDATE');

  revoke update on table public.work_orders from public, anon, authenticated;

  for v_column in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.work_orders'::regclass
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format('revoke update (%I) on table public.work_orders from public, anon, authenticated', v_column);
  end loop;

  grant update (
    case_id,
    quote_id,
    client_id,
    site_id,
    main_equipment_id,
    contact_id,
    access_requirement_id,
    title,
    description,
    type,
    priority,
    origin,
    scheduled_date,
    scheduled_time,
    estimated_duration_minutes,
    planned_material,
    technical_team,
    diagnosis,
    work_performed,
    result
  ) on table public.work_orders to authenticated;

  if has_table_privilege('service_role', 'public.work_orders', 'UPDATE') is distinct from v_service_role_had_table_update
     or exists (
       select 1 from pg_attribute a
       where a.attrelid = 'public.work_orders'::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('service_role', 'public.work_orders', a.attname, 'UPDATE')
             is distinct from exists (select 1 from dmp145_service_role_update_columns s where s.column_name = a.attname)
     ) then
    raise exception '145: WAITING_FOR_REMOTE_PREFLIGHT - service_role UPDATE changed; no synthetic restoration';
  end if;
end;
$$;

commit;
