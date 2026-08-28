-- Read-only metadata probe for the remotely applied 088.
-- It intentionally never selects a work_orders routing column directly.
-- Returns exactly one result set: check_name, status, detail.

with checks(check_name,status,detail) as (
  select 'work_orders_088_columns',case when count(*)=10 then 'OK' else 'BLOCKER' end,
    coalesce(string_agg(column_name||' ['||data_type||', default='||coalesce(column_default,'NULL')||', nullable='||is_nullable||']',', ' order by ordinal_position),'Ninguna columna 088 encontrada')
  from information_schema.columns
  where table_schema='public' and table_name='work_orders'
    and column_name in ('sat_review_status','sat_review_destination','sat_review_flags','sat_review_reason','sat_reviewed_at','sat_reviewed_by','commercial_review_status','commercial_review_reason','commercial_reviewed_at','commercial_reviewed_by')
  union all
  select 'sat_review_status_exists',case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='sat_review_status') then 'OK' else 'BLOCKER' end,'Metadata de sat_review_status consultada en information_schema.columns'
  union all
  select 'sat_review_destination_exists',case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='sat_review_destination') then 'OK' else 'BLOCKER' end,'Metadata de sat_review_destination consultada en information_schema.columns'
  union all
  select 'commercial_review_status_exists',case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='commercial_review_status') then 'OK' else 'BLOCKER' end,'Metadata de commercial_review_status consultada en information_schema.columns'
  union all
  select 'office_validation_status_exists',case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name='office_validation_status') then 'OK' else 'BLOCKER' end,'Metadata de office_validation_status consultada en information_schema.columns'
  union all
  select 'sat_review_rpc_exists',case when to_regprocedure('public.dmp_review_work_order_sat(uuid,text,text,jsonb,text)') is not null then 'OK' else 'BLOCKER' end,'Firma dmp_review_work_order_sat(uuid,text,text,jsonb,text)'
  union all
  select 'commercial_review_rpc_exists',case when to_regprocedure('public.dmp_review_work_order_commercial(uuid,text)') is not null then 'OK' else 'BLOCKER' end,'Firma dmp_review_work_order_commercial(uuid,text)'
  union all
  select 'office_review_rpc_exists',case when to_regprocedure('public.dmp_review_work_order_office(uuid,text,text)') is not null then 'OK' else 'BLOCKER' end,'Firma reemplazada dmp_review_work_order_office(uuid,text,text)'
), summary as (
  select 'SUMMARY',case when count(*) filter(where status='BLOCKER')>0 then 'BLOCKER' else 'OK' end,
    case when count(*) filter(where status='BLOCKER')>0 then 'Faltan columnas o RPCs de 088; comparar con el script local ejecutado.' else 'Las columnas y RPCs metadata de 088 están presentes.' end from checks
)
select check_name,status,detail from (select * from checks union all select * from summary) result
order by case when check_name='SUMMARY' then 2 else 1 end,case status when 'BLOCKER' then 1 when 'OK' then 2 else 3 end,check_name;
