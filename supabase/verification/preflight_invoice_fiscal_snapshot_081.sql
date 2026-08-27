with checks(check_group,check_name,status,affected_rows,details) as (
  select 'STRUCTURE','fiscal_snapshot_column',case when count(*)=1 then 'OK' else 'BLOCKER' end,count(*)::bigint,'Columna fiscal_snapshot disponible' from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='fiscal_snapshot'
  union all select 'DEPENDENCIES','issue_rpc',case when to_regprocedure('public.dmp_issue_invoice(uuid)') is not null then 'OK' else 'BLOCKER' end,1,'RPC de emisión disponible'
  union all select 'COMPATIBILITY','company_fiscal_fields',case when count(*) >= 10 then 'OK' else 'BLOCKER' end,count(*)::bigint,'Campos fiscales del emisor disponibles' from information_schema.columns where table_schema='public' and table_name='companies' and column_name in ('name','tax_id','address','postal_code','city','province','country','phone','email','website')
  union all select 'DATA','issued_without_snapshot',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,'Facturas emitidas anteriores a 081 sin snapshot; se mantienen como legado' from public.invoices where status in ('emitida','parcialmente_cobrada','cobrada','cancelada') and fiscal_snapshot is null
  union all select 'SECURITY','invoice_rls',case when c.relrowsecurity then 'OK' else 'BLOCKER' end,1,'RLS de invoices permanece activo' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='invoices'
)
select check_group,check_name,status,affected_rows,details from checks order by check_group,check_name;
