-- Read-only postcheck for 072_quote_immutable_canonical_integrity.sql.
-- Run after 072. This script returns one result set and never changes data.

with checks(check_group, check_name, status, affected_rows, details) as (
  select '072'::text, 'required_functions',
    case when count(*) = 3 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' de 3 funciones de integridad 072 presentes'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'dmp_quote_terminal_header_guard',
      'dmp_quote_line_editable_guard',
      'dmp_quote_line_rate_snapshot_trigger'
    )
  union all
  select '072', 'required_triggers',
    case when count(*) = 5 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' de 5 triggers de presupuestos/líneas presentes y habilitados'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgenabled = 'O'
    and ((c.relname = 'quotes' and t.tgname in ('quote_terminal_header_guard', 'quotes_status_guard_trigger'))
      or (c.relname = 'quote_lines' and t.tgname in ('quote_line_editable_guard', 'quote_line_rate_snapshot_trigger', 'quote_lines_recalculate_trigger')))
  union all
  select '072', 'quote_line_company_constraints',
    case when count(*) = 2 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' de 2 FK compuestas de empresa presentes en quote_lines'
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public'
    and r.relname = 'quote_lines'
    and c.conname in ('quote_lines_company_rate_version_fk', 'quote_lines_company_concept_fk')
    and c.contype = 'f'
  union all
  select '072', 'rls_objects',
    case when count(*) = 2 then 'OK' else 'REVIEW' end,
    count(*)::bigint,
    count(*)::text || ' de 2 tablas de presupuestos/líneas tienen RLS habilitado'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('quotes', 'quote_lines')
    and c.relrowsecurity
  union all
  select '072', 'terminal_legacy_lines',
    case when count(*) = 4 then 'OK' else 'REVIEW' end,
    count(*)::bigint,
    count(*)::text || ' líneas terminales legacy con concept_id y sin rate_version_id; se conservan sin backfill'
  from public.quote_lines l
  join public.quotes q on q.id = l.quote_id and q.company_id = l.company_id
  where l.deleted_at is null
    and q.deleted_at is null
    and q.status in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado')
    and l.concept_id is not null
    and l.rate_version_id is null
  union all
  select '072', 'invalid_canonical_references',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' líneas con referencias canónicas inválidas o cruzadas de empresa'
  from public.quote_lines l
  left join public.rate_catalog c on c.id = l.concept_id
  left join public.rate_versions v on v.id = l.rate_version_id
  where l.deleted_at is null
    and ((l.concept_id is not null and (c.id is null or c.company_id is distinct from l.company_id))
      or (l.rate_version_id is not null and (v.id is null or v.company_id is distinct from l.company_id or v.rate_id is distinct from l.concept_id)))
  union all
  select '072', 'mixed_line_references',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' líneas combinan material_id y concept_id'
  from public.quote_lines
  where deleted_at is null and material_id is not null and concept_id is not null
  union all
  select '072', 'canonical_snapshot_completeness',
    case when count(*) = 0 then 'OK' else 'REVIEW' end,
    count(*)::bigint,
    count(*)::text || ' snapshots canónicos incompletos'
  from public.quote_lines
  where deleted_at is null
    and concept_id is not null
    and (unit is null or billing_mode is null or unit_cost is null or unit_price is null
      or quantity is null or total_cost is null or total_price is null)
  union all
  select '072', 'tenant_consistency',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' líneas pertenecen a una empresa distinta de su presupuesto'
  from public.quote_lines l
  join public.quotes q on q.id = l.quote_id
  where l.company_id is distinct from q.company_id
  union all
  select '072', 'legacy_snapshot_report',
    'INFO',
    count(*)::bigint,
    coalesce(jsonb_agg(jsonb_build_object(
      'line_id', l.id,
      'quote_id', l.quote_id,
      'unit', l.unit,
      'quantity', l.quantity,
      'unit_cost', l.unit_cost,
      'unit_price', l.unit_price,
      'total_cost', l.total_cost,
      'total_price', l.total_price
    ) order by l.id)::text, '[]')
  from public.quote_lines l
  join public.quotes q on q.id = l.quote_id and q.company_id = l.company_id
  where l.deleted_at is null
    and q.deleted_at is null
    and q.status in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado')
    and l.concept_id is not null
    and l.rate_version_id is null
), summary(check_group, check_name, status, affected_rows, details) as (
  select 'SUMMARY', 'postcheck_072',
    case when sum(case when status = 'BLOCKER' then 1 else 0 end) > 0 then 'BLOCKER'
      when sum(case when status = 'REVIEW' then 1 else 0 end) > 0 then 'REVIEW'
      else 'OK' end,
    sum(case when status in ('BLOCKER','REVIEW') then 1 else 0 end)::bigint,
    case when sum(case when status = 'BLOCKER' then 1 else 0 end) > 0 then 'No considerar 072 validada.'
      when sum(case when status = 'REVIEW' then 1 else 0 end) > 0 then 'Revisar los controles marcados antes de continuar.'
      else '072 validada sin BLOCKER ni REVIEW.' end
  from checks
)
select check_group, check_name, status, affected_rows, details
from (select * from checks union all select * from summary) result
order by case check_group when '072' then 1 when 'SUMMARY' then 2 else 3 end,
  case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'INFO' then 3 when 'OK' then 4 else 5 end,
  check_name;
