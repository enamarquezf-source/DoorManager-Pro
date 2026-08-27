-- Read-only preflight for 077. Run before applying historical compatibility.

with finalized(status) as (values ('Finalizado tecnicamente'),('Enviado'),('Cerrado')),
terminal as (
  select w.* from public.work_orders w where w.deleted_at is null and w.status in (select status from finalized)
),
candidates as (
  select w.* from terminal w
  where w.office_validation_status='not_started'
    and coalesce(w.invoiced_amount,0)=0
    and coalesce(w.paid_amount,0)=0
    and w.economic_status not in ('facturado','cobrado')
    and not exists (select 1 from public.invoice_work_orders l where l.work_order_id=w.id and l.deleted_at is null)
),
checks(check_group,check_name,status,affected_rows,details) as (
  select 'DEPENDENCIES','office_validation_columns',case when count(*)=4 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' de 4 columnas 073' from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name in ('office_validation_status','office_validation_reason','office_validated_at','office_validated_by')
  union all select 'DEPENDENCIES','billing_objects',case when count(*)=3 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' de 3 objetos 074' from information_schema.tables where table_schema='public' and table_name in ('invoices','invoice_work_orders','invoice_payments')
  union all select 'DEPENDENCIES','historical_review_rpc',case when to_regprocedure('public.dmp_review_work_order_office(uuid,text,text)') is not null then 'OK' else 'BLOCKER' end,case when to_regprocedure('public.dmp_review_work_order_office(uuid,text,text)') is not null then 1 else 0 end,coalesce(to_regprocedure('public.dmp_review_work_order_office(uuid,text,text)')::text,'Falta RPC 073')
  union all select 'DEPENDENCIES','invoice_rpc',case when to_regprocedure('public.dmp_create_invoice_from_work_order(uuid,numeric,date,text)') is not null then 'OK' else 'BLOCKER' end,case when to_regprocedure('public.dmp_create_invoice_from_work_order(uuid,numeric,date,text)') is not null then 1 else 0 end,coalesce(to_regprocedure('public.dmp_create_invoice_from_work_order(uuid,numeric,date,text)')::text,'Falta RPC 074')
  union all select 'DEPENDENCIES','audit_update_operation',case when exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='audit_log' and c.conname='audit_log_operation_check' and pg_get_constraintdef(c.oid) ilike '%UPDATE%') then 'OK' else 'BLOCKER' end,case when exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='audit_log' and c.conname='audit_log_operation_check' and pg_get_constraintdef(c.oid) ilike '%UPDATE%') then 1 else 0 end,'UPDATE requerido para auditar la normalizacion 077'
  union all select 'UNIVERSE','finalized_work_orders','OK',count(*)::bigint,count(*)::text||' partes terminales activos' from terminal
  union all select 'UNIVERSE','office_pending',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' terminales con office_validation_status=pending' from terminal where office_validation_status='pending'
  union all select 'UNIVERSE','office_validated',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' terminales con office_validation_status=validated' from terminal where office_validation_status='validated'
  union all select 'UNIVERSE','office_rejected',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' terminales con office_validation_status=rejected' from terminal where office_validation_status='rejected'
  union all select 'IMPACT','historical_not_started',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,count(*)::text||' candidatos de backfill' from candidates
  union all select 'IMPACT','historical_billable_candidates',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,count(*)::text||' candidatos billables pendientes de validacion' from candidates where coalesce(warranty,false)=false and coalesce(billable,true)=true
  union all select 'IMPACT','historical_warranty',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' candidatos garantia; se marcaran validated/garantia' from candidates where coalesce(warranty,false)=true
  union all select 'IMPACT','historical_non_billable',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' candidatos billable=false; se marcaran validated/no_facturable' from candidates where coalesce(billable,true)=false
  union all select 'IMPACT','historical_zero_sale',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,count(*)::text||' candidatos billables con sale_amount=0' from candidates where coalesce(warranty,false)=false and coalesce(billable,true)=true and coalesce(sale_amount,0)=0
  union all select 'IMPACT','historical_estimated_only',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,count(*)::text||' candidatos con sale_amount=0 y estimated_sale_amount>0; no se convertira automaticamente' from candidates where coalesce(warranty,false)=false and coalesce(billable,true)=true and coalesce(sale_amount,0)=0 and coalesce(estimated_sale_amount,0)>0
  union all select 'IMPACT','historical_no_billable_amount',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,count(*)::text||' candidatos sin importe facturable real ni estimacion' from candidates where coalesce(warranty,false)=false and coalesce(billable,true)=true and coalesce(sale_amount,0)=0 and coalesce(estimated_sale_amount,0)=0
  union all select 'DATA','terminal_invoiced',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' terminales con invoiced_amount>0' from terminal where coalesce(invoiced_amount,0)>0
  union all select 'DATA','terminal_paid',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' terminales con paid_amount>0' from terminal where coalesce(paid_amount,0)>0
  union all select 'DATA','terminal_invoice_links',case when count(*)=0 then 'OK' else 'INFO' end,count(*)::bigint,count(*)::text||' enlaces activos a facturas' from public.invoice_work_orders l join terminal w on w.id=l.work_order_id where l.deleted_at is null
  union all select 'DATA','missing_client_or_company',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' terminales sin cliente o empresa valida' from terminal w left join public.clients c on c.id=w.client_id and c.company_id=w.company_id where w.company_id is null or w.client_id is null or c.id is null
  union all select 'DATA','invoice_duplicates',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' partes con multiples facturas activas' from (select work_order_id from public.invoice_work_orders where deleted_at is null group by work_order_id having count(*)>1) d
  union all select 'DATA','invoice_tenant_mismatch',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::bigint,count(*)::text||' enlaces con tenant incompatible' from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id join public.work_orders w on w.id=l.work_order_id where l.company_id is distinct from i.company_id or l.company_id is distinct from w.company_id
  union all select 'DATA','impossible_validation_economics',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::bigint,count(*)::text||' combinaciones office/economic a revisar' from terminal where (office_validation_status='validated' and economic_status='pendiente_validacion') or (office_validation_status='pending' and economic_status in ('facturado','cobrado'))
)
select check_group,check_name,status,affected_rows,details from checks order by case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'INFO' then 3 else 4 end,check_group,check_name;
