-- Read-only preflight for 075. Run before applying the material write boundary.

with required_material_columns(column_name) as (
  values ('id'),('company_id'),('code'),('description'),('manufacturer'),('reference'),('unit'),('cost'),('price'),('minimum_stock'),('active'),('created_at'),('updated_at'),('deleted_at'),('stock_quantity'),('stock_controlled'),('allow_negative_stock'),('last_stock_movement_at')
),
required_movement_columns(column_name) as (
  values ('id'),('company_id'),('material_id'),('work_order_id'),('work_order_material_id'),('quote_id'),('movement_type'),('quantity'),('previous_stock'),('new_stock'),('unit_cost'),('reason'),('source'),('created_by'),('created_at'),('deleted_at')
),
constraint_state as (
  select pg_get_constraintdef(c.oid) as definition
  from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace
  where n.nspname='public' and r.relname='audit_log' and c.conname='audit_log_operation_check'
),
checks(check_group, check_name, status, affected_rows, details) as (
  select 'BASE','materials_table',case when to_regclass('public.materials') is null then 'BLOCKER' else 'OK' end,case when to_regclass('public.materials') is null then 0 else 1 end,coalesce(to_regclass('public.materials')::text,'Falta public.materials')
  union all select 'BASE','stock_movements_table',case when to_regclass('public.material_stock_movements') is null then 'BLOCKER' else 'OK' end,case when to_regclass('public.material_stock_movements') is null then 0 else 1 end,coalesce(to_regclass('public.material_stock_movements')::text,'Falta public.material_stock_movements de 035')
  union all select 'BASE','materials_required_columns',case when count(*)=18 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' de 18 columnas requeridas'
    from required_material_columns e join information_schema.columns c on c.table_schema='public' and c.table_name='materials' and c.column_name=e.column_name
  union all select 'BASE','stock_movements_required_columns',case when count(*)=16 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' de 16 columnas requeridas por 035'
    from required_movement_columns e join information_schema.columns c on c.table_schema='public' and c.table_name='material_stock_movements' and c.column_name=e.column_name
  union all select 'DEPENDENCIES','stock_adjustment_rpc',case when to_regprocedure('public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric)') is null then 'BLOCKER' else 'OK' end,case when to_regprocedure('public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric)') is null then 0 else 1 end,coalesce(to_regprocedure('public.dmp_adjust_material_stock(uuid,text,numeric,text,numeric)')::text,'Falta RPC de 035')
  union all select 'DEPENDENCIES','stock_movement_rpc',case when to_regprocedure('public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid)') is null then 'BLOCKER' else 'OK' end,case when to_regprocedure('public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid)') is null then 0 else 1 end,coalesce(to_regprocedure('public.dmp_apply_material_stock_movement(uuid,text,numeric,text,text,uuid,uuid,uuid,numeric,uuid)')::text,'Falta RPC de 035')
  union all select 'DEPENDENCIES','audit_material_create_operation',case when exists(select 1 from constraint_state where definition ilike '%MATERIAL_CREATE%') then 'OK' else 'BLOCKER' end,case when exists(select 1 from constraint_state where definition ilike '%MATERIAL_CREATE%') then 1 else 0 end,coalesce((select definition from constraint_state),'audit_log_operation_check no admite MATERIAL_CREATE')
  union all select 'DATA','current_incompatible_audit_rows',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,coalesce(string_agg(distinct operation, ', ' order by operation),'Ninguna') from public.audit_log where operation not in ('INSERT','UPDATE','DELETE','SOFT_DELETE','OPERATIONAL_UPDATE','TECHNICAL_FINALIZE','TECHNICAL_FINALIZE_PENDING_OFFICE','OFFICE_VALIDATE','OFFICE_REJECT','INVOICE_ISSUE','PAYMENT_RECORD','MATERIAL_CREATE')
  union all select 'OBJECTS','create_material_rpc_state',case when to_regprocedure('public.dmp_create_material_with_stock(jsonb)') is null then 'INFO' else 'REVIEW' end,case when to_regprocedure('public.dmp_create_material_with_stock(jsonb)') is null then 0 else 1 end,case when to_regprocedure('public.dmp_create_material_with_stock(jsonb)') is null then 'RPC no existe; estado esperado antes de 075' else 'RPC ya existe; 075 la reemplazara, revisar despliegue previo' end
  union all select 'PRIVILEGES','stock_update_currently_granted',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,case when count(*)=0 then 'authenticated no tiene UPDATE de stock_quantity' else 'authenticated tiene UPDATE de stock_quantity; 075 lo revocara' end
    from information_schema.column_privileges where table_schema='public' and table_name='materials' and column_name='stock_quantity' and grantee='authenticated' and privilege_type='UPDATE'
  union all select 'DATA','null_stock_values',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' materiales con stock_quantity NULL' from public.materials where stock_quantity is null
  union all select 'DATA','negative_stock_without_permission',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' materiales con stock negativo sin allow_negative_stock' from public.materials where stock_quantity<0 and not allow_negative_stock
  union all select 'DATA','movement_material_or_tenant_mismatch',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' movimientos sin material valido o con empresa incompatible' from public.material_stock_movements sm left join public.materials m on m.id=sm.material_id where m.id is null or sm.company_id is distinct from m.company_id
  union all select 'DATA','duplicate_material_codes',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' codigos de material duplicados por empresa' from (select company_id,code from public.materials group by company_id,code having count(*)>1) duplicates
)
select check_group,check_name,status,affected_rows,details from checks
order by case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'INFO' then 3 else 4 end,check_group,check_name;
