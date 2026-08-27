-- Read-only preflight for 074. Run before applying the invoicing migration.

with required_tables(table_name, expected_columns) as (
  values
    ('invoices', 20),
    ('invoice_work_orders', 11),
    ('invoice_payments', 13)
),
table_state as (
  select r.table_name,
         r.expected_columns,
         to_regclass('public.' || r.table_name) is not null as exists_now,
         count(c.column_name)::bigint as actual_columns
  from required_tables r
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = r.table_name
  group by r.table_name, r.expected_columns
),
constraint_state as (
  select pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' and r.relname = 'audit_log' and c.conname = 'audit_log_operation_check'
),
checks(check_group, check_name, status, affected_rows, details) as (
  select 'BASE', 'required_base_tables', case when count(*) = 4 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 4 tablas base (companies, clients, profiles, work_orders)'
  from information_schema.tables
  where table_schema = 'public' and table_name in ('companies', 'clients', 'profiles', 'work_orders')
  union all
  select 'DEPENDENCIES', '073_office_validation', case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='office_validation_status') then 'OK' else 'BLOCKER' end, case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='office_validation_status') then 1 else 0 end, 'work_orders.office_validation_status requerido por 074'
  union all
  select 'DEPENDENCIES', '076_audit_operations', case when exists (select 1 from constraint_state where definition ilike '%INVOICE_ISSUE%' and definition ilike '%PAYMENT_RECORD%') then 'OK' else 'BLOCKER' end, case when exists (select 1 from constraint_state where definition ilike '%INVOICE_ISSUE%' and definition ilike '%PAYMENT_RECORD%') then 1 else 0 end, coalesce((select definition from constraint_state), 'Falta audit_log_operation_check o no admite INVOICE_ISSUE/PAYMENT_RECORD')
  union all
  select 'OBJECTS', table_name, case when exists_now and actual_columns <> expected_columns then 'BLOCKER' when exists_now then 'REVIEW' else 'INFO' end, actual_columns, case when not exists_now then table_name || ' no existe; esperado antes de 074' when actual_columns <> expected_columns then table_name || ' existe parcialmente (' || actual_columns || '/' || expected_columns || ' columnas)' else table_name || ' ya existe completo; revisar datos y contrato antes de continuar' end
  from table_state
  union all
  select 'DEPENDENCIES', 'required_work_order_columns', case when count(*) = 6 then 'OK' else 'BLOCKER' end, count(*)::bigint, count(*)::text || ' de 6 columnas 073/074 requeridas (office_validation_status, economic_status, sale_amount, invoiced_amount, paid_amount, deleted_at)'
  from information_schema.columns
  where table_schema = 'public' and table_name = 'work_orders' and column_name in ('office_validation_status', 'economic_status', 'sale_amount', 'invoiced_amount', 'paid_amount', 'deleted_at')
)
select check_group, check_name, status, affected_rows, details
from checks
order by case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'INFO' then 3 else 4 end, check_group, check_name;
