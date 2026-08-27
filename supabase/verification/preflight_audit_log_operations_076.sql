-- Read-only preflight for migration 076. Run before applying it.

with expected(operation) as (
  values
    ('INSERT'),
    ('UPDATE'),
    ('DELETE'),
    ('SOFT_DELETE'),
    ('OPERATIONAL_UPDATE'),
    ('TECHNICAL_FINALIZE'),
    ('TECHNICAL_FINALIZE_PENDING_OFFICE'),
    ('OFFICE_VALIDATE'),
    ('OFFICE_REJECT'),
    ('INVOICE_ISSUE'),
    ('PAYMENT_RECORD'),
    ('MATERIAL_CREATE')
),
constraint_state as (
  select c.oid, pg_get_constraintdef(c.oid) as definition
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public'
    and r.relname = 'audit_log'
    and c.conname = 'audit_log_operation_check'
),
column_state as (
  select data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'audit_log' and column_name = 'operation'
),
checks(check_group, check_name, status, affected_rows, details) as (
  select 'GENERAL', 'audit_log_table', case when to_regclass('public.audit_log') is null then 'BLOCKER' else 'OK' end, case when to_regclass('public.audit_log') is null then 0 else 1 end, coalesce(to_regclass('public.audit_log')::text, 'Falta public.audit_log')
  union all
  select 'GENERAL', 'audit_log_operation_column', case when exists (select 1 from column_state) then 'OK' else 'BLOCKER' end, case when exists (select 1 from column_state) then 1 else 0 end, case when exists (select 1 from column_state) then 'public.audit_log.operation existe' else 'Falta public.audit_log.operation' end
  union all
  select 'GENERAL', 'audit_log_operation_type', case when (select data_type from column_state) = 'text' then 'OK' else 'BLOCKER' end, case when (select data_type from column_state) = 'text' then 1 else 0 end, coalesce((select data_type from column_state), 'Falta la columna operation')
  union all
  select 'GENERAL', 'audit_log_operation_check', case when exists (select 1 from constraint_state) then 'OK' else 'BLOCKER' end, case when exists (select 1 from constraint_state) then 1 else 0 end, coalesce((select definition from constraint_state), 'Falta la constraint explícita')
  union all
  select 'OPERATIONS', 'missing_expected_operations', case when count(*) = 0 then 'OK' else 'BLOCKER' end, count(*)::bigint, coalesce(string_agg(operation, ', ' order by operation), 'Ninguna')
  from expected
  where not exists (select 1 from constraint_state where definition ilike '%' || quote_literal(expected.operation) || '%')
)
select check_group, check_name, status, affected_rows, details
from checks
order by case status when 'BLOCKER' then 1 when 'REVIEW' then 2 else 3 end, check_group, check_name;
