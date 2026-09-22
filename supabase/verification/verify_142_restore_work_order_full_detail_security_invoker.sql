-- Read-only fail-hard verification for migration 142.

do $verify$
declare
  v_view_oid oid;
  v_relkind "char";
  v_reloptions text[];
  v_economic_position integer;
  v_economic_type text;
  v_base_type text;
  v_base_nullable text;
begin
  select c.oid, c.relkind, c.reloptions
    into v_view_oid, v_relkind, v_reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_work_order_full_detail';

  if not found then
    raise exception '142 contract failed: view public.v_work_order_full_detail does not exist';
  end if;

  if v_relkind <> 'v' then
    raise exception '142 contract failed: public.v_work_order_full_detail is not a view';
  end if;

  if not coalesce(v_reloptions @> array['security_invoker=true']::text[], false) then
    raise exception '142 contract failed: security_invoker=true is not enabled';
  end if;

  select c.ordinal_position, c.data_type
    into v_economic_position, v_economic_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'v_work_order_full_detail'
    and c.column_name = 'economic_status';

  if not found then
    raise exception '142 contract failed: view economic_status column is missing';
  end if;

  if v_economic_position <> 25 then
    raise exception '142 contract failed: view economic_status is at position %, expected 25', v_economic_position;
  end if;

  if v_economic_type <> 'text' then
    raise exception '142 contract failed: view economic_status type is %, expected text', v_economic_type;
  end if;

  select c.data_type, c.is_nullable
    into v_base_type, v_base_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'work_orders'
    and c.column_name = 'economic_status';

  if not found then
    raise exception '142 contract failed: work_orders.economic_status does not exist';
  end if;

  if v_base_type <> 'text' then
    raise exception '142 contract failed: work_orders.economic_status type is %, expected text', v_base_type;
  end if;

  if v_base_nullable <> 'NO' then
    raise exception '142 contract failed: work_orders.economic_status is nullable';
  end if;
end
$verify$;
