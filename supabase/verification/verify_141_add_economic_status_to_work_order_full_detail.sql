-- Read-only fail-hard verification for migration 141.

do $$
declare
  v_view_oid oid;
  v_column_count integer;
  v_actual_name text;
  v_actual_type text;
  v_definition text;
  v_base_type text;
  v_base_nullable text;
  v_reloptions text[];
  expected record;
begin
  select c.oid, c.reloptions
    into v_view_oid, v_reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_work_order_full_detail'
    and c.relkind = 'v';

  if not found then
    raise exception '141 contract failed: view public.v_work_order_full_detail does not exist';
  end if;

  select count(*)
    into v_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_work_order_full_detail';

  if v_column_count <> 25 then
    raise exception '141 contract failed: expected exactly 25 view columns, found %', v_column_count;
  end if;

  for expected in
    select *
    from (values
      (1, 'id', 'uuid'),
      (2, 'company_id', 'uuid'),
      (3, 'code', 'text'),
      (4, 'title', 'text'),
      (5, 'description', 'text'),
      (6, 'type', 'text'),
      (7, 'priority', 'text'),
      (8, 'status', 'text'),
      (9, 'origin', 'text'),
      (10, 'scheduled_date', 'date'),
      (11, 'scheduled_time', 'time without time zone'),
      (12, 'diagnosis', 'text'),
      (13, 'work_performed', 'text'),
      (14, 'result', 'text'),
      (15, 'case_code', 'text'),
      (16, 'client_code', 'text'),
      (17, 'client_name', 'text'),
      (18, 'site_code', 'text'),
      (19, 'site_name', 'text'),
      (20, 'equipment_code', 'text'),
      (21, 'equipment_type', 'text'),
      (22, 'main_technician_name', 'text'),
      (23, 'created_by_name', 'text'),
      (24, 'deleted_at', 'timestamp with time zone')
    ) as e(ordinal_position, column_name, type_name)
  loop
    select c.column_name, c.data_type
      into v_actual_name, v_actual_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'v_work_order_full_detail'
      and c.ordinal_position = expected.ordinal_position;

    if not found then
      raise exception '141 contract failed: missing historical column at ordinal %', expected.ordinal_position;
    end if;

    if v_actual_name <> expected.column_name then
      raise exception '141 contract failed: ordinal % expected column %, found %', expected.ordinal_position, expected.column_name, v_actual_name;
    end if;

    if v_actual_type <> expected.type_name then
      raise exception '141 contract failed: column % expected type %, found %', expected.column_name, expected.type_name, v_actual_type;
    end if;
  end loop;

  select c.column_name, c.data_type
    into v_actual_name, v_actual_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'v_work_order_full_detail'
    and c.ordinal_position = 25;

  if not found or v_actual_name <> 'economic_status' then
    raise exception '141 contract failed: economic_status is not column 25';
  end if;

  if v_actual_type <> 'text' then
    raise exception '141 contract failed: economic_status view type is %, expected text', v_actual_type;
  end if;

  select pg_get_viewdef(v_view_oid, true)
    into v_definition;

  if position('wo.economic_status' in lower(v_definition)) = 0 then
    raise exception '141 contract failed: view definition does not reference wo.economic_status';
  end if;

  select c.data_type, c.is_nullable
    into v_base_type, v_base_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'work_orders'
    and c.column_name = 'economic_status';

  if not found then
    raise exception '141 contract failed: work_orders.economic_status does not exist';
  end if;

  if v_base_type <> 'text' then
    raise exception '141 contract failed: work_orders.economic_status type is %, expected text', v_base_type;
  end if;

  if v_base_nullable <> 'NO' then
    raise exception '141 contract failed: work_orders.economic_status is nullable';
  end if;

  if not coalesce(v_reloptions @> array['security_invoker=true']::text[], false) then
    raise exception '141 contract failed: historical security_invoker=true option is not preserved';
  end if;
end
$$;
