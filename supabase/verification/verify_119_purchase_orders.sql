-- Strict structural postflight for migration 119. No data is inserted or changed.
do $$
declare
  v_table text;
  v_column text;
  v_type text;
  v_not_null boolean;
  v_ok boolean;
  v_name text;
  v_arity integer;
  v_item text[];
  v_expression text;
  v_rpc_oids oid[];
  v_proc oid;
  v_prosecdef boolean;
  v_proconfig text[];
begin
  foreach v_table in array array['purchase_orders','purchase_order_lines'] loop
    if to_regclass('public.' || v_table) is null then raise exception '119 contract failed: public.% is missing', v_table; end if;
    if not exists (select 1 from pg_class where oid = ('public.' || v_table)::regclass and relrowsecurity) then raise exception '119 contract failed: RLS missing on public.%', v_table; end if;
  end loop;

  foreach v_item slice 1 in array array[
    ['purchase_orders','id','uuid','true'], ['purchase_orders','company_id','uuid','true'], ['purchase_orders','code','text','true'],
    ['purchase_orders','supplier_id','uuid','true'], ['purchase_orders','order_date','date','true'], ['purchase_orders','status','text','true'],
    ['purchase_orders','destination_warehouse_id','uuid','false'], ['purchase_orders','supplier_reference','text','false'], ['purchase_orders','notes','text','false'],
    ['purchase_orders','subtotal','numeric','true'], ['purchase_orders','total_amount','numeric','true'], ['purchase_orders','created_by','uuid','false'],
    ['purchase_orders','created_at','timestamptz','true'], ['purchase_orders','updated_at','timestamptz','true'], ['purchase_orders','cancelled_at','timestamptz','false'],
    ['purchase_order_lines','id','uuid','true'], ['purchase_order_lines','company_id','uuid','true'], ['purchase_order_lines','purchase_order_id','uuid','true'],
    ['purchase_order_lines','material_id','uuid','true'], ['purchase_order_lines','material_supplier_id','uuid','false'], ['purchase_order_lines','material_description_snapshot','text','true'],
    ['purchase_order_lines','supplier_reference_snapshot','text','false'], ['purchase_order_lines','unit_snapshot','text','true'], ['purchase_order_lines','ordered_quantity','numeric','true'],
    ['purchase_order_lines','unit_purchase_price','numeric','false'], ['purchase_order_lines','subtotal','numeric','false'], ['purchase_order_lines','created_at','timestamptz','true'], ['purchase_order_lines','updated_at','timestamptz','true']
  ]::text[][] loop
    v_table := v_item[1]; v_column := v_item[2]; v_type := v_item[3]; v_not_null := v_item[4] = 'true';
    select exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = v_table and c.column_name = v_column and c.udt_name = v_type and c.is_nullable = case when v_not_null then 'NO' else 'YES' end) into v_ok;
    if not v_ok then raise exception '119 contract failed: %.% has wrong type/nullability', v_table, v_column; end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_orders' and column_name = 'subtotal' and numeric_precision = 12 and numeric_scale = 2) or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_orders' and column_name = 'total_amount' and numeric_precision = 12 and numeric_scale = 2) then raise exception '119 contract failed: each order total must be numeric(12,2)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_order_lines' and column_name = 'ordered_quantity' and numeric_precision = 12 and numeric_scale = 2) or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_order_lines' and column_name = 'unit_purchase_price' and numeric_precision = 12 and numeric_scale = 2) or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purchase_order_lines' and column_name = 'subtotal' and numeric_precision = 12 and numeric_scale = 2) then raise exception '119 contract failed: each line amount must be numeric(12,2)'; end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_orders'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'code')]::smallint[]) then
    raise exception '119 contract failed: purchase_orders(company_id,code) is not unique';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_orders'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'id')]::smallint[]) then
    raise exception '119 contract failed: purchase_orders(company_id,id) is not unique';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_orders'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'supplier_id')]::smallint[] and confrelid = 'public.suppliers'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.suppliers'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.suppliers'::regclass and attname = 'id')]::smallint[]) then raise exception '119 contract failed: supplier foreign key is incorrect'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_orders'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'destination_warehouse_id')]::smallint[] and confrelid = 'public.warehouses'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.warehouses'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.warehouses'::regclass and attname = 'id')]::smallint[]) then raise exception '119 contract failed: warehouse foreign key is incorrect'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_order_lines'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_order_lines'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_order_lines'::regclass and attname = 'purchase_order_id')]::smallint[] and confrelid = 'public.purchase_orders'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_orders'::regclass and attname = 'id')]::smallint[]) then raise exception '119 contract failed: order foreign key is incorrect'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_order_lines'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_order_lines'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_order_lines'::regclass and attname = 'material_id')]::smallint[] and confrelid = 'public.materials'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.materials'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.materials'::regclass and attname = 'id')]::smallint[]) then raise exception '119 contract failed: material foreign key is incorrect'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_order_lines'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.purchase_order_lines'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.purchase_order_lines'::regclass and attname = 'material_supplier_id')]::smallint[] and confrelid = 'public.material_suppliers'::regclass and confkey = array[(select attnum from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'company_id'), (select attnum from pg_attribute where attrelid = 'public.material_suppliers'::regclass and attname = 'id')]::smallint[]) then raise exception '119 contract failed: material supplier foreign key is incorrect'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.purchase_orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%draft%ordered%cancelled%') then raise exception '119 contract failed: status contract missing'; end if;

  foreach v_name in array array['purchase_orders_company_status_idx','purchase_orders_supplier_idx','purchase_orders_warehouse_idx','purchase_order_lines_order_idx','purchase_order_lines_material_idx'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = v_name and c.relkind = 'i') then raise exception '119 contract failed: index % is missing', v_name; end if;
  end loop;
  foreach v_item slice 1 in array array[
    ['purchase_orders','purchase_orders_select_backoffice','SELECT'], ['purchase_orders','purchase_orders_insert_backoffice','INSERT'], ['purchase_orders','purchase_orders_update_backoffice','UPDATE'],
    ['purchase_order_lines','purchase_order_lines_select_backoffice','SELECT'], ['purchase_order_lines','purchase_order_lines_insert_backoffice','INSERT'], ['purchase_order_lines','purchase_order_lines_update_backoffice','UPDATE'],
    ['purchase_orders','purchase_orders_platform_superadmin_select','SELECT'], ['purchase_orders','purchase_orders_platform_superadmin_insert','INSERT'], ['purchase_orders','purchase_orders_platform_superadmin_update','UPDATE'],
    ['purchase_order_lines','purchase_order_lines_platform_superadmin_select','SELECT'], ['purchase_order_lines','purchase_order_lines_platform_superadmin_insert','INSERT'], ['purchase_order_lines','purchase_order_lines_platform_superadmin_update','UPDATE']
  ]::text[][] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = v_item[1] and policyname = v_item[2] and cmd = v_item[3] and roles = array['authenticated']::name[]) then raise exception '119 contract failed: policy %.% has wrong table, command or role', v_item[1], v_item[2]; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('purchase_orders','purchase_order_lines') and cmd = 'DELETE') then raise exception '119 contract failed: purchase DELETE policy exists'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('purchase_orders','purchase_order_lines') and grantee = 'anon') then raise exception '119 contract failed: anon has purchase table privileges'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('purchase_orders','purchase_order_lines') and grantee = 'authenticated' and privilege_type in ('DELETE','TRUNCATE','REFERENCES','TRIGGER')) then raise exception '119 contract failed: authenticated has forbidden purchase privilege'; end if;
  foreach v_table in array array['purchase_orders','purchase_order_lines'] loop
    if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = v_table and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) then raise exception '119 contract failed: authenticated has direct write privilege on %', v_table; end if;
    foreach v_name in array array['SELECT','INSERT','UPDATE'] loop
      if v_name = 'SELECT' and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = v_table and grantee = 'authenticated' and privilege_type = v_name) then raise exception '119 contract failed: authenticated lacks % on %', v_name, v_table; end if;
    end loop;
  end loop;
  foreach v_table in array array['purchase_orders','purchase_order_lines'] loop
    foreach v_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || v_table, v_name) then raise exception '119 contract failed: anon has % on %', v_name, v_table; end if;
    end loop;
    if not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') then raise exception '119 contract failed: authenticated lacks SELECT on %', v_table; end if;
    foreach v_name in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated', 'public.' || v_table, v_name) then raise exception '119 contract failed: authenticated has effective % on %', v_name, v_table; end if;
    end loop;
  end loop;

  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_create_purchase_order' and p.pronargs = 6 and p.proargtypes[0] = 'uuid'::regtype and p.proargtypes[1] = 'uuid'::regtype and p.proargtypes[2] = 'date'::regtype and p.proargtypes[3] = 'uuid'::regtype and p.proargtypes[4] = 'text'::regtype and p.proargtypes[5] = 'text'::regtype and p.prorettype = 'uuid'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_create_purchase_order signature is missing'; end if;
  v_rpc_oids := array[v_proc];
  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_update_purchase_order' and p.pronargs = 6 and p.proargtypes[0] = 'uuid'::regtype and p.proargtypes[1] = 'uuid'::regtype and p.proargtypes[2] = 'date'::regtype and p.proargtypes[3] = 'uuid'::regtype and p.proargtypes[4] = 'text'::regtype and p.proargtypes[5] = 'text'::regtype and p.prorettype = 'uuid'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_update_purchase_order signature is missing'; end if;
  v_rpc_oids := v_rpc_oids || v_proc;
  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_add_purchase_order_line' and p.pronargs = 5 and p.proargtypes[0] = 'uuid'::regtype and p.proargtypes[1] = 'uuid'::regtype and p.proargtypes[2] = 'uuid'::regtype and p.proargtypes[3] = 'numeric'::regtype and p.proargtypes[4] = 'numeric'::regtype and p.prorettype = 'uuid'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_add_purchase_order_line signature is missing'; end if;
  v_rpc_oids := v_rpc_oids || v_proc;
  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_update_purchase_order_line' and p.pronargs = 5 and p.proargtypes[0] = 'uuid'::regtype and p.proargtypes[1] = 'uuid'::regtype and p.proargtypes[2] = 'uuid'::regtype and p.proargtypes[3] = 'numeric'::regtype and p.proargtypes[4] = 'numeric'::regtype and p.prorettype = 'uuid'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_update_purchase_order_line signature is missing'; end if;
  v_rpc_oids := v_rpc_oids || v_proc;
  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_remove_purchase_order_line' and p.pronargs = 1 and p.proargtypes[0] = 'uuid'::regtype and p.prorettype = 'void'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_remove_purchase_order_line signature is missing'; end if;
  v_rpc_oids := v_rpc_oids || v_proc;
  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_order_purchase_order' and p.pronargs = 1 and p.proargtypes[0] = 'uuid'::regtype and p.prorettype = 'uuid'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_order_purchase_order signature is missing'; end if;
  v_rpc_oids := v_rpc_oids || v_proc;
  select p.oid into v_proc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_cancel_purchase_order' and p.pronargs = 1 and p.proargtypes[0] = 'uuid'::regtype and p.prorettype = 'uuid'::regtype;
  if v_proc is null then raise exception '119 contract failed: dmp_cancel_purchase_order signature is missing'; end if;
  v_rpc_oids := v_rpc_oids || v_proc;
  foreach v_proc in array v_rpc_oids loop
    select p.prosecdef, coalesce(p.proconfig, array[]::text[]) into v_prosecdef, v_proconfig from pg_proc p where p.oid = v_proc;
    if not v_prosecdef or not (v_proconfig @> array['search_path=public']) then raise exception '119 contract failed: RPC security definer/search_path is invalid for OID %', v_proc; end if;
  end loop;
  for v_expression in
    select lower(regexp_replace(replace(coalesce(p.qual, ''), 'public.', ''), '\s+', ' ', 'g'))
    from pg_policies p where p.schemaname = 'public' and p.policyname in ('purchase_orders_select_backoffice','purchase_orders_update_backoffice','purchase_order_lines_select_backoffice','purchase_order_lines_update_backoffice')
    union all
    select lower(regexp_replace(replace(coalesce(p.with_check, ''), 'public.', ''), '\s+', ' ', 'g'))
    from pg_policies p where p.schemaname = 'public' and p.policyname in ('purchase_orders_insert_backoffice','purchase_orders_update_backoffice','purchase_order_lines_insert_backoffice','purchase_order_lines_update_backoffice')
  loop
    if position('company_id' in v_expression) = 0 or position('current_company_id' in v_expression) = 0 or position('has_any_role' in v_expression) = 0 or position('superadmin' in v_expression) = 0 or position('gerencia' in v_expression) = 0 or position('oficina' in v_expression) = 0 or position(' or ' in v_expression) > 0 then raise exception '119 contract failed: backoffice policy scope is invalid'; end if;
  end loop;
  for v_expression in
    select lower(coalesce(p.qual, '')) from pg_policies p where p.schemaname = 'public' and p.policyname in ('purchase_orders_platform_superadmin_select','purchase_order_lines_platform_superadmin_select','purchase_orders_platform_superadmin_update','purchase_order_lines_platform_superadmin_update')
    union all
    select lower(coalesce(p.with_check, '')) from pg_policies p where p.schemaname = 'public' and p.policyname in ('purchase_orders_platform_superadmin_insert','purchase_order_lines_platform_superadmin_insert','purchase_orders_platform_superadmin_update','purchase_order_lines_platform_superadmin_update')
  loop
    if position('is_platform_superadmin' in v_expression) = 0 then raise exception '119 contract failed: platform superadmin policy scope is invalid'; end if;
  end loop;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename in ('purchase_orders','purchase_order_lines') and p.policyname in ('purchase_orders_select_backoffice','purchase_order_lines_select_backoffice') and position('sat' in lower(coalesce(p.qual, ''))) = 0) then raise exception '119 contract failed: SAT cannot read purchase orders'; end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename in ('purchase_orders','purchase_order_lines') and p.policyname in ('purchase_orders_insert_backoffice','purchase_orders_update_backoffice','purchase_order_lines_insert_backoffice','purchase_order_lines_update_backoffice') and (position('sat' in lower(coalesce(p.qual, ''))) > 0 or position('sat' in lower(coalesce(p.with_check, ''))) > 0)) then raise exception '119 contract failed: SAT can write purchase orders'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where c.oid = 'public.purchase_order_lines'::regclass and t.tgname = 'purchase_order_line_guard_trigger' and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 8) = 8 and (t.tgtype & 16) = 16 and p.proname = 'dmp_purchase_order_line_guard') then raise exception '119 contract failed: line guard must cover BEFORE INSERT/UPDATE/DELETE'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where c.oid = 'public.purchase_order_lines'::regclass and t.tgname = 'purchase_order_line_totals_trigger' and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16 and p.proname = 'dmp_purchase_order_line_totals') then raise exception '119 contract failed: line totals must run BEFORE INSERT/UPDATE'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where c.oid = 'public.purchase_order_lines'::regclass and t.tgname = 'purchase_order_totals_trigger' and not t.tgisinternal and (t.tgtype & 2) = 0 and (t.tgtype & 4) = 4 and (t.tgtype & 8) = 8 and (t.tgtype & 16) = 16 and p.proname = 'dmp_purchase_order_refresh_totals') then raise exception '119 contract failed: order totals must run AFTER INSERT/UPDATE/DELETE'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where c.oid = 'public.purchase_orders'::regclass and t.tgname = 'purchase_order_status_guard_trigger' and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 and p.proname = 'dmp_purchase_order_status_guard') then raise exception '119 contract failed: status guard must cover BEFORE UPDATE'; end if;
  if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = any(v_rpc_oids) and (a.grantee = 0 or a.grantee = 'anon'::regrole) and a.privilege_type = 'EXECUTE') then raise exception '119 contract failed: anon/public can execute purchase RPC'; end if;
  if exists (select 1 from pg_proc p where p.oid = any(v_rpc_oids) and not has_function_privilege('authenticated', p.oid, 'EXECUTE')) then raise exception '119 contract failed: authenticated lacks purchase RPC EXECUTE'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and policyname like '%purchase%line%' and cmd = 'DELETE') then raise exception '119 contract failed: purchase lines are hard-deletable through RLS'; end if;
end;
$$;

select 'verify_119_purchase_orders: PASS' as result;
