-- 093 preflight. Read-only; execute only against an explicitly selected environment.
with checks as (
  select 'RPC'::text as area, 'rpc_092_exists'::text as check_name,
    case when count(*) = 1 then 'OK' else 'BLOCKER' end as status,
    count(*)::bigint as finding_count,
    'La RPC 092 existe antes de aplicar la correccion'::text as detail
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname = 'dmp_delete_invoice_draft'
    and pg_get_function_identity_arguments(oid) = 'p_invoice_id uuid'
  union all
  select 'RPC', 'rpc_092_signature', case when count(*) = 1 then 'OK' else 'BLOCKER' end, count(*)::bigint, 'Firma exacta p_invoice_id uuid'
  from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'dmp_delete_invoice_draft' and pg_get_function_identity_arguments(oid) = 'p_invoice_id uuid'
  union all
  select 'RPC', 'defective_audit_insert_detected',
    case when position('jsonb_build_object(''invoice'', to_jsonb(v_invoice), ''lines'', v_lines)' in coalesce(pg_get_functiondef(p.oid), '')) > 0 then 'REVIEW' else 'OK' end,
    case when position('jsonb_build_object(''invoice'', to_jsonb(v_invoice), ''lines'', v_lines)' in coalesce(pg_get_functiondef(p.oid), '')) > 0 then 1 else 0 end,
    'REVIEW indica la version 092 con el valor v_actor.id ausente'
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_delete_invoice_draft' and pg_get_function_identity_arguments(p.oid) = 'p_invoice_id uuid'
  union all
  select 'STRUCTURE', 'audit_log_columns',
    case when count(*) = 7 then 'OK' else 'BLOCKER' end, count(*)::bigint,
    'audit_log conserva las siete columnas usadas por la RPC'
  from information_schema.columns
  where table_schema = 'public' and table_name = 'audit_log'
    and column_name in ('company_id', 'table_name', 'record_id', 'operation', 'changed_by', 'old_data', 'new_data')
  union all
  select 'DATA', 'draft_candidates_intact',
    case when count(*) filter (where i.code is not null or i.fiscal_snapshot is not null or p.invoice_id is not null) = 0 then 'OK' else 'REVIEW' end,
    count(*)::bigint,
    'Los borradores candidatos no deben tener numero, snapshot ni pagos'
  from public.invoices i
  left join public.invoice_payments p on p.invoice_id = i.id
  where i.status = 'borrador'
)
select area, check_name, status, finding_count, detail from checks order by area, check_name;
