-- Strict structural verification for migration 120. Read-only.
do $$
declare
  v_table text; v_column text; v_name text; v_item text[]; v_expression text;
  v_proc oid; v_stock_proc oid; v_rpc_oids oid[] := '{}'; v_definition text; v_auth_definition text; v_attnum smallint; v_constraint oid; v_values text[]; v_count integer;
begin
  foreach v_table in array array['purchase_receipts','purchase_receipt_lines'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v_table and c.relkind='r' and c.relrowsecurity) then raise exception '120 contract failed: public.% table/RLS missing', v_table; end if;
  end loop;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public' and r.relname = 'purchase_order_lines'
      and c.conname = 'purchase_order_lines_company_id_id_unique'
      and c.contype = 'u'
      and c.conkey = array[
        (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'company_id' and not a.attisdropped),
        (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'id' and not a.attisdropped)
      ]::smallint[]
  ) then raise exception '120 contract failed: purchase order line tenant candidate key'; end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_class dst on dst.oid = c.confrelid
    join pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
    where c.contype = 'f' and src_ns.nspname = 'public' and src.relname = 'purchase_receipt_lines'
      and dst_ns.nspname = 'public' and dst.relname = 'purchase_order_lines'
      and c.conkey = array[
        (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'company_id' and not a.attisdropped),
        (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'purchase_order_line_id' and not a.attisdropped)
      ]::smallint[]
      and c.confkey = array[
        (select a.attnum from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'company_id' and not a.attisdropped),
        (select a.attnum from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'id' and not a.attisdropped)
      ]::smallint[]
  ) then raise exception '120 contract failed: receipt-line order-line FK'; end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_class dst on dst.oid = c.confrelid
    join pg_namespace dst_ns on dst_ns.oid = dst.relnamespace
    where c.contype = 'f' and src_ns.nspname = 'public' and src.relname = 'stock_movements'
      and dst_ns.nspname = 'public' and dst.relname = 'purchase_order_lines'
      and c.conkey = array[
        (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'company_id' and not a.attisdropped),
        (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'purchase_order_line_id' and not a.attisdropped)
      ]::smallint[]
      and c.confkey = array[
        (select a.attnum from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'company_id' and not a.attisdropped),
        (select a.attnum from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'id' and not a.attisdropped)
      ]::smallint[]
  ) then raise exception '120 contract failed: stock movement order-line FK'; end if;

  foreach v_item slice 1 in array array[
    ['purchase_receipts','id','uuid','NO'],['purchase_receipts','company_id','uuid','NO'],['purchase_receipts','purchase_order_id','uuid','NO'],['purchase_receipts','code','text','NO'],['purchase_receipts','receipt_date','date','NO'],['purchase_receipts','warehouse_id','uuid','NO'],['purchase_receipts','supplier_id','uuid','NO'],['purchase_receipts','supplier_document_reference','text','YES'],['purchase_receipts','notes','text','YES'],['purchase_receipts','status','text','NO'],['purchase_receipts','created_by','uuid','NO'],['purchase_receipts','created_at','timestamptz','NO'],['purchase_receipts','updated_at','timestamptz','NO'],['purchase_receipts','confirmed_at','timestamptz','YES'],
    ['purchase_receipt_lines','id','uuid','NO'],['purchase_receipt_lines','company_id','uuid','NO'],['purchase_receipt_lines','purchase_receipt_id','uuid','NO'],['purchase_receipt_lines','purchase_order_line_id','uuid','NO'],['purchase_receipt_lines','material_id','uuid','NO'],['purchase_receipt_lines','description_snapshot','text','NO'],['purchase_receipt_lines','unit_snapshot','text','NO'],['purchase_receipt_lines','supplier_reference_snapshot','text','YES'],['purchase_receipt_lines','received_quantity','numeric','NO'],['purchase_receipt_lines','actual_unit_cost','numeric','YES'],['purchase_receipt_lines','subtotal','numeric','YES'],['purchase_receipt_lines','created_at','timestamptz','NO'],['purchase_receipt_lines','updated_at','timestamptz','NO'],
    ['stock_movements','purchase_order_id','uuid','YES'],['stock_movements','purchase_order_line_id','uuid','YES'],['stock_movements','purchase_receipt_id','uuid','YES'],['stock_movements','purchase_receipt_line_id','uuid','YES'],['stock_movements','unit_cost','numeric','YES'],['stock_movements','source','text','YES'],['stock_movements','source_reference','text','YES']
  ]::text[][] loop
    if not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_item[1] and c.column_name=v_item[2] and c.udt_name=v_item[3] and c.is_nullable=v_item[4]) then raise exception '120 contract failed: %.% type/nullability', v_item[1], v_item[2]; end if;
  end loop;
  foreach v_item slice 1 in array array[['purchase_receipt_lines','received_quantity'],['purchase_receipt_lines','actual_unit_cost'],['purchase_receipt_lines','subtotal'],['stock_movements','unit_cost']]::text[][] loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=v_item[1] and column_name=v_item[2] and numeric_precision=12 and numeric_scale=2) then raise exception '120 contract failed: %.% must be numeric(12,2)', v_item[1], v_item[2]; end if;
  end loop;
  if not exists (select 1 from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='public' and c.relname='purchase_receipts' and a.attname='status' and lower(pg_get_expr(d.adbin,d.adrelid)) like '%draft%') then raise exception '120 contract failed: receipt status default draft missing'; end if;
  foreach v_item slice 1 in array array[['purchase_receipts','id','gen_random_uuid'],['purchase_receipts','receipt_date','current_date'],['purchase_receipts','created_at','now'],['purchase_receipts','updated_at','now'],['purchase_receipt_lines','id','gen_random_uuid'],['purchase_receipt_lines','created_at','now'],['purchase_receipt_lines','updated_at','now']]::text[][] loop
    if not exists (select 1 from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='public' and c.relname=v_item[1] and a.attname=v_item[2] and lower(pg_get_expr(d.adbin,d.adrelid)) like '%'||v_item[3]||'%') then raise exception '120 contract failed: default %.% missing',v_item[1],v_item[2]; end if;
  end loop;

  foreach v_table in array array['purchase_receipts','purchase_receipt_lines'] loop
    select a.attnum into v_attnum from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v_table and a.attname='id' and not a.attisdropped;
    if not exists (select 1 from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=v_table and i.indisprimary and i.indnkeyatts=1 and i.indkey[0]=v_attnum) then raise exception '120 contract failed: %.id primary key missing', v_table; end if;
  end loop;

  -- Composite FKs are verified by relation OIDs and ordered attribute numbers, not names.
  if not exists (select 1 from pg_constraint c where c.contype='f' and c.conrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='purchase_receipts') and c.conkey=ARRAY[(select attnum from pg_attribute where attrelid=c.conrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.conrelid and attname='purchase_order_id')::smallint] and c.confrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='purchase_orders') and c.confkey=ARRAY[(select attnum from pg_attribute where attrelid=c.confrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')::smallint]) then raise exception '120 contract failed: receipt/order tenant FK'; end if;
  if not exists (select 1 from pg_constraint c where c.contype='f' and c.conrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='purchase_receipts') and c.conkey=ARRAY[(select attnum from pg_attribute where attrelid=c.conrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.conrelid and attname='warehouse_id')::smallint] and c.confrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='warehouses') and c.confkey=ARRAY[(select attnum from pg_attribute where attrelid=c.confrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')::smallint]) then raise exception '120 contract failed: receipt/warehouse tenant FK'; end if;
  if not exists (select 1 from pg_constraint c where c.contype='f' and c.conrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='purchase_receipts') and c.conkey=ARRAY[(select attnum from pg_attribute where attrelid=c.conrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.conrelid and attname='supplier_id')::smallint] and c.confrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='suppliers') and c.confkey=ARRAY[(select attnum from pg_attribute where attrelid=c.confrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')::smallint]) then raise exception '120 contract failed: receipt/supplier tenant FK'; end if;
  foreach v_item slice 1 in array array[['purchase_receipt_lines','purchase_receipt_id','purchase_receipts'],['purchase_receipt_lines','purchase_order_line_id','purchase_order_lines'],['purchase_receipt_lines','material_id','materials'],['stock_movements','purchase_order_id','purchase_orders'],['stock_movements','purchase_order_line_id','purchase_order_lines'],['stock_movements','purchase_receipt_id','purchase_receipts'],['stock_movements','purchase_receipt_line_id','purchase_receipt_lines']]::text[][] loop
    if not exists (select 1 from pg_constraint c where c.contype='f' and c.conrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname=v_item[1]) and c.conkey=ARRAY[(select attnum from pg_attribute where attrelid=c.conrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.conrelid and attname=v_item[2])::smallint] and c.confrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname=v_item[3]) and c.confkey=ARRAY[(select attnum from pg_attribute where attrelid=c.confrelid and attname='company_id')::smallint,(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')::smallint]) then raise exception '120 contract failed: tenant FK %.% -> %', v_item[1], v_item[2], v_item[3]; end if;
  end loop;

  if not exists (select 1 from pg_class i join pg_namespace n on n.oid=i.relnamespace join pg_index x on x.indexrelid=i.oid where n.nspname='public' and i.relname='stock_movements_purchase_receipt_line_once' and x.indrelid=(select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname='public') and relname='stock_movements') and x.indisunique and x.indnkeyatts=1 and x.indkey[0]=(select attnum from pg_attribute where attrelid=x.indrelid and attname='purchase_receipt_line_id') and lower(regexp_replace(pg_get_expr(x.indpred,x.indrelid),'[[:space:]()]','','g'))='purchase_receipt_line_idisnotnull') then raise exception '120 contract failed: structural receipt-line unique index missing'; end if;
  if not exists (select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='purchase_receipt_lines' and c.conname='purchase_receipt_lines_received_quantity_check' and c.contype='c' and lower(regexp_replace(pg_get_constraintdef(c.oid),'[[:space:]()]','','g')) like '%received_quantity>0%') then raise exception '120 contract failed: receipt quantity check missing'; end if;
  select count(*) into v_count from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='purchase_receipt_lines' and c.contype='c' and lower(regexp_replace(pg_get_constraintdef(c.oid),'[[:space:]()]','','g')) like '%received_quantity>0%';
  if v_count <> 1 then raise exception '120 contract failed: received quantity check must exist exactly once'; end if;
  if not exists (select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='purchase_receipt_lines' and c.conname='purchase_receipt_lines_actual_cost_check' and c.contype='c' and lower(regexp_replace(pg_get_constraintdef(c.oid),'[[:space:]()]','','g')) like '%actual_unit_costisnulloractual_unit_cost>=0%') then raise exception '120 contract failed: receipt actual cost check missing'; end if;
  if not exists (select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='stock_movements' and c.conname='stock_movements_purchase_unit_cost_check' and c.contype='c' and lower(regexp_replace(pg_get_constraintdef(c.oid),'[[:space:]()]','','g')) like '%unit_costisnullorunit_cost>=0%') then raise exception '120 contract failed: movement unit cost check missing'; end if;
  select c.oid, array_agg(m[1] order by m[1]) into v_constraint, v_values from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') m where n.nspname='public' and r.relname='purchase_orders' and c.conname='purchase_orders_status_check' and c.contype='c' group by c.oid;
  if v_constraint is null or v_values is distinct from ARRAY['cancelled','draft','ordered','partially_received','received']::text[] then raise exception '120 contract failed: purchase order status values are not exact'; end if;
  select c.oid, array_agg(m[1] order by m[1]) into v_constraint, v_values from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''', 'g') m where n.nspname='public' and r.relname='purchase_receipts' and c.conname='purchase_receipts_status_check' and c.contype='c' group by c.oid;
  if v_constraint is null or v_values is distinct from ARRAY['cancelled','confirmed','draft']::text[] then raise exception '120 contract failed: receipt status values are not exact'; end if;

  -- Exact RPC signatures, then reuse the resulting OIDs for security/ACL checks.
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_create_purchase_receipt' and p.pronargs=5 and p.proargtypes[0]='uuid'::regtype and p.proargtypes[1]='date'::regtype and p.proargtypes[2]='uuid'::regtype and p.proargtypes[3]='text'::regtype and p.proargtypes[4]='text'::regtype and p.prorettype='uuid'::regtype; if v_proc is null then raise exception '120 contract failed: create RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_purchase_receipt' and p.pronargs=5 and p.proargtypes[0]='uuid'::regtype and p.proargtypes[1]='date'::regtype and p.proargtypes[2]='uuid'::regtype and p.proargtypes[3]='text'::regtype and p.proargtypes[4]='text'::regtype and p.prorettype='uuid'::regtype; if v_proc is null then raise exception '120 contract failed: update RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_add_purchase_receipt_line' and p.pronargs=4 and p.proargtypes[0]='uuid'::regtype and p.proargtypes[1]='uuid'::regtype and p.proargtypes[2]='numeric'::regtype and p.proargtypes[3]='numeric'::regtype and p.prorettype='uuid'::regtype; if v_proc is null then raise exception '120 contract failed: add line RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_update_purchase_receipt_line' and p.pronargs=3 and p.proargtypes[0]='uuid'::regtype and p.proargtypes[1]='numeric'::regtype and p.proargtypes[2]='numeric'::regtype and p.prorettype='uuid'::regtype; if v_proc is null then raise exception '120 contract failed: update line RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_remove_purchase_receipt_line' and p.pronargs=1 and p.proargtypes[0]='uuid'::regtype and p.prorettype='void'::regtype; if v_proc is null then raise exception '120 contract failed: remove line RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_confirm_purchase_receipt' and p.pronargs=1 and p.proargtypes[0]='uuid'::regtype and p.prorettype='uuid'::regtype; if v_proc is null then raise exception '120 contract failed: confirm RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  select p.oid into v_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_cancel_draft_purchase_receipt' and p.pronargs=1 and p.proargtypes[0]='uuid'::regtype and p.prorettype='uuid'::regtype; if v_proc is null then raise exception '120 contract failed: cancel RPC signature'; end if; v_rpc_oids:=v_rpc_oids||v_proc;
  -- Resolve the canonical stock function by its complete positional signature.
  select p.oid into v_stock_proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_adjust_warehouse_stock' and p.pronargs=6 and p.proargtypes[0]='uuid'::regtype and p.proargtypes[1]='uuid'::regtype and p.proargtypes[2]='text'::regtype and p.proargtypes[3]='numeric'::regtype and p.proargtypes[4]='text'::regtype and p.proargtypes[5]='text'::regtype and p.prorettype='numeric'::regtype;
  if v_stock_proc is null then raise exception '120 contract failed: canonical stock signature'; end if;
  if not exists (select 1 from pg_proc p where p.oid=v_stock_proc and p.prosecdef and p.proconfig @> array['search_path=public']) then raise exception '120 contract failed: canonical stock security definer/search_path'; end if;
  if not has_function_privilege('authenticated',v_stock_proc,'EXECUTE') or has_function_privilege('anon',v_stock_proc,'EXECUTE') then raise exception '120 contract failed: canonical stock effective ACL'; end if;
  if exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_stock_proc),acldefault('f',(select proowner from pg_proc where oid=v_stock_proc)))) a where a.grantee=0 and a.privilege_type='EXECUTE') then raise exception '120 contract failed: canonical stock PUBLIC execute ACL'; end if;
  foreach v_proc in array v_rpc_oids loop
    if not exists (select 1 from pg_proc p where p.oid=v_proc and p.prosecdef and p.proconfig @> array['search_path=public']) then raise exception '120 contract failed: RPC security definer/search_path'; end if;
    if not has_function_privilege('authenticated',v_proc,'EXECUTE') or has_function_privilege('anon',v_proc,'EXECUTE') then raise exception '120 contract failed: RPC effective ACL'; end if;
    if exists (select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=v_proc),acldefault('f',(select proowner from pg_proc where oid=v_proc)))) a where a.grantee=0 and a.privilege_type='EXECUTE') then raise exception '120 contract failed: PUBLIC execute ACL'; end if;
  end loop;

  -- The real authorization contract makes platform superadmins pass the
  -- tenant-role gate; current_company_id() remains the profile's company
  -- and is bypassed by the explicit platform checks in these RPCs.
  v_auth_definition:=pg_get_functiondef('public.has_any_role(text[])'::regprocedure);
  if position('public.is_platform_superadmin()' in lower(v_auth_definition))=0 then raise exception '120 contract failed: has_any_role does not include platform superadmin'; end if;
  v_auth_definition:=pg_get_functiondef('public.is_platform_superadmin()'::regprocedure);
  if position('p.auth_user_id = auth.uid()' in lower(v_auth_definition))=0 or position('p.active = true' in lower(v_auth_definition))=0 then raise exception '120 contract failed: platform superadmin identity guard'; end if;
  v_auth_definition:=pg_get_functiondef('public.current_company_id()'::regprocedure);
  if position('p.company_id' in lower(v_auth_definition))=0 or position('auth.uid()' in lower(v_auth_definition))=0 then raise exception '120 contract failed: current company contract'; end if;
  foreach v_name in array array['dmp_create_purchase_receipt','dmp_update_purchase_receipt','dmp_add_purchase_receipt_line','dmp_update_purchase_receipt_line','dmp_remove_purchase_receipt_line','dmp_confirm_purchase_receipt','dmp_cancel_draft_purchase_receipt','dmp_adjust_warehouse_stock'] loop
    select pg_get_functiondef(p.oid) into v_definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=v_name and p.prosecdef;
    if v_definition is null or position('has_any_role' in lower(v_definition))=0 or position('is_platform_superadmin' in lower(v_definition))=0 then raise exception '120 contract failed: platform RPC guard %',v_name; end if;
  end loop;

  foreach v_item slice 1 in array array[['purchase_receipts','purchase_receipts_select_backoffice'],['purchase_receipts','purchase_receipts_platform_superadmin_select'],['purchase_receipt_lines','purchase_receipt_lines_select_backoffice'],['purchase_receipt_lines','purchase_receipt_lines_platform_superadmin_select']]::text[][] loop
    if not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=v_item[1] and p.policyname=v_item[2] and p.cmd='SELECT' and p.roles=array['authenticated']::name[] and ((v_item[2] like '%platform%' and position('is_platform_superadmin' in lower(coalesce(p.qual,'')))>0) or (v_item[2] not like '%platform%' and position('current_company_id' in lower(coalesce(p.qual,'')))>0 and position('has_any_role' in lower(coalesce(p.qual,'')))>0 and position('sat' in lower(coalesce(p.qual,'')))>0 and position('gerencia' in lower(coalesce(p.qual,'')))>0 and position('oficina' in lower(coalesce(p.qual,'')))>0))) then raise exception '120 contract failed: policy %.%',v_item[1],v_item[2]; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname='public' and tablename in ('purchase_receipts','purchase_receipt_lines') and cmd<>'SELECT') then raise exception '120 contract failed: receipt write policy exists'; end if;
  foreach v_table in array array['purchase_receipts','purchase_receipt_lines'] loop
    if has_table_privilege('anon','public.'||v_table,'SELECT') or has_table_privilege('anon','public.'||v_table,'INSERT') or has_table_privilege('anon','public.'||v_table,'UPDATE') or has_table_privilege('anon','public.'||v_table,'DELETE') or has_table_privilege('anon','public.'||v_table,'TRUNCATE') or has_table_privilege('anon','public.'||v_table,'REFERENCES') or has_table_privilege('anon','public.'||v_table,'TRIGGER') then raise exception '120 contract failed: anon grants on %',v_table; end if;
    if not has_table_privilege('authenticated','public.'||v_table,'SELECT') or has_table_privilege('authenticated','public.'||v_table,'INSERT') or has_table_privilege('authenticated','public.'||v_table,'UPDATE') or has_table_privilege('authenticated','public.'||v_table,'DELETE') or has_table_privilege('authenticated','public.'||v_table,'TRUNCATE') or has_table_privilege('authenticated','public.'||v_table,'REFERENCES') or has_table_privilege('authenticated','public.'||v_table,'TRIGGER') then raise exception '120 contract failed: authenticated grants on %',v_table; end if;
  end loop;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and c.relname='purchase_receipts' and t.tgname='purchase_receipt_guard_trigger' and p.proname='dmp_purchase_receipt_guard' and (t.tgtype&1)=1 and (t.tgtype&2)=2 and (t.tgtype&16)=16 and (t.tgtype&8)=8) then raise exception '120 contract failed: receipt guard trigger'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and c.relname='purchase_receipt_lines' and t.tgname='purchase_receipt_line_guard_trigger' and p.proname='dmp_purchase_receipt_line_guard' and (t.tgtype&1)=1 and (t.tgtype&2)=2 and (t.tgtype&4)=4 and (t.tgtype&16)=16 and (t.tgtype&8)=8) then raise exception '120 contract failed: receipt line guard trigger'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and c.relname='purchase_orders' and t.tgname='purchase_order_status_guard_trigger' and p.proname='dmp_purchase_order_status_guard' and (t.tgtype&1)=1 and (t.tgtype&2)=2 and (t.tgtype&16)=16) then raise exception '120 contract failed: order status trigger'; end if;

  v_definition:=pg_get_functiondef('public.dmp_confirm_purchase_receipt(uuid)'::regprocedure);
  foreach v_name in array array['for update','status = ''confirmed'' then return','status <> ''draft''','actual_unit_cost is null','v_received + v_line.received_quantity > v_ordered','dmp_adjust_warehouse_stock','purchase-receipt-line:','source=''purchase_receipt''','status=''confirmed''','status=''partially_received''','status=''received'''] loop if position(lower(v_name) in lower(v_definition))=0 then raise exception '120 contract failed: confirmation clause %',v_name; end if; end loop;
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p where p.oid=v_stock_proc;
  foreach v_name in array array['has_any_role','p_quantity is null or p_quantity <= 0','p_movement_type not in','idempotency_key','movement_type <> p_movement_type','v_existing.quantity <> p_quantity','insert into public.warehouse_stock','on conflict','for update','v_new < 0','insert into public.stock_movements'] loop if position(lower(v_name) in lower(v_definition))=0 then raise exception '120 contract failed: canonical stock clause %',v_name; end if; end loop;
end;
$$;
select 'verify_120_purchase_receipts: PASS' as result;
