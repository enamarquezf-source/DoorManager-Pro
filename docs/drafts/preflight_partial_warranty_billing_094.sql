-- 094 preflight: lectura exclusiva, un result set.
with checks as (
  select 'schema' category, 'work_orders columns' check_name,
    count(*)::text actual_value, '5' expected_value,
    case when count(*)=5 then 'OK' else 'REVISAR' end status
  from information_schema.columns
  where table_schema='public' and table_name='work_orders'
    and column_name in ('warranty','billable','economic_status','sale_amount','real_cost_amount')
  union all
  select 'schema','decision tables',count(*)::text,'2',case when count(*)=2 then 'OK' else 'REVISAR' end
  from information_schema.tables where table_schema='public' and table_name in ('work_order_planned_material_decisions','work_order_quote_line_decisions')
  union all
  select 'schema','billing_decision absent',count(*)::text,'0',case when count(*)=0 then 'OK' else 'BLOQUEAR' end
  from information_schema.columns where table_schema='public' and column_name='billing_decision'
  union all
  select 'rpc','effective functions',count(*)::text,'4',case when count(*)=4 then 'OK' else 'REVISAR' end
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('dmp_finalize_work_order_technical','dmp_guided_billing_eligible','dmp_prepare_invoice_from_work_order','dmp_set_work_order_quote_line_decision')
  union all
  select 'data','warranty work orders',count(*)::text,'informativo','OK' from public.work_orders where deleted_at is null and warranty
  union all
  select 'data','warranty with costs',count(*)::text,'informativo','OK' from public.work_orders w where w.deleted_at is null and w.warranty and exists(select 1 from public.work_order_time_entries t where t.work_order_id=w.id union all select 1 from public.work_order_materials m where m.work_order_id=w.id and m.deleted_at is null union all select 1 from public.work_order_cost_entries c where c.work_order_id=w.id and c.deleted_at is null)
  union all
  select 'data','warranty additional billable',count(*)::text,'informativo','OK' from public.work_orders w where w.deleted_at is null and w.warranty and exists(select 1 from public.work_order_materials m where m.work_order_id=w.id and m.deleted_at is null and m.source='additional' and m.contributes_to_sale union all select 1 from public.work_order_time_entries t where t.work_order_id=w.id and t.source='additional' and t.contributes_to_sale union all select 1 from public.work_order_cost_entries c where c.work_order_id=w.id and c.deleted_at is null and c.source='additional' and c.contributes_to_sale)
  union all
  select 'safety','warranty billable currently',count(*)::text,'informativo','REVISAR' from public.work_orders where deleted_at is null and warranty and billable
  union all
  select 'safety','warranty invoice links',count(*)::text,'informativo','REVISAR' from public.invoice_work_orders l join public.work_orders w on w.id=l.work_order_id where l.deleted_at is null and w.warranty
  union all
  select 'safety','warranty drafts',count(*)::text,'informativo','REVISAR' from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id join public.work_orders w on w.id=l.work_order_id where l.deleted_at is null and i.status='borrador' and w.warranty
  union all
  select 'safety','warranty issued invoices',count(*)::text,'informativo','REVISAR' from public.invoice_work_orders l join public.invoices i on i.id=l.invoice_id join public.work_orders w on w.id=l.work_order_id where l.deleted_at is null and i.status<>'borrador' and w.warranty
  union all
  select 'safety','duplicate active quote decisions',count(*)::text,'0',case when count(*)=0 then 'OK' else 'BLOQUEAR' end from (select company_id,work_order_id,quote_line_id,count(*) from public.work_order_quote_line_decisions where deleted_at is null group by company_id,work_order_id,quote_line_id having count(*)>1) d
  union all
  select 'safety','tenant mismatched quote decisions',count(*)::text,'0',case when count(*)=0 then 'OK' else 'BLOQUEAR' end from public.work_order_quote_line_decisions d join public.work_orders w on w.id=d.work_order_id where d.company_id<>w.company_id
)
select category,check_name,actual_value,expected_value,status from checks order by category,check_name;
-- NO APLICAR. REFERENCIA DE BORRADOR. DISENO SUPERADO POR AUDITORIA FUNDACIONAL.
