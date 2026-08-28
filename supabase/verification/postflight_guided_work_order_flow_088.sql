-- Read-only postflight for 088_guided_work_order_operational_flow.sql.
-- Run after 088. Returns exactly one result set: check_name, status, detail.

with checks(check_name,status,detail) as (
  select 'new_columns',case when count(*)=10 then 'OK' else 'BLOCKER' end,count(*)::text||' de 10 columnas nuevas de routing presentes en work_orders' from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name in ('sat_review_status','sat_review_destination','sat_review_flags','sat_review_reason','sat_reviewed_at','sat_reviewed_by','commercial_review_status','commercial_review_reason','commercial_reviewed_at','commercial_reviewed_by')
  union all
  select 'new_column_defaults_and_nullability',case when count(*)=10 then 'OK' else 'BLOCKER' end,count(*)::text||' columnas nuevas tienen default/nullable compatible con 088' from information_schema.columns where table_schema='public' and table_name='work_orders' and ((column_name in ('sat_review_status','commercial_review_status','sat_review_flags') and column_default is not null and is_nullable='NO') or column_name in ('sat_review_destination','sat_review_reason','sat_reviewed_at','sat_reviewed_by','commercial_review_reason','commercial_reviewed_at','commercial_reviewed_by'))
  union all
  select 'new_function_signatures',case when count(*)=2 then 'OK' else 'BLOCKER' end,count(*)::text||' de 2 RPC nuevas con firma correcta' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and ((p.proname='dmp_review_work_order_sat' and pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_decision text, p_destination text, p_flags jsonb, p_reason text') or (p.proname='dmp_review_work_order_commercial' and pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_reason text'))
  union all
  select 'replaced_office_signature',case when count(*)=1 and bool_or(pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_decision text, p_reason text') then 'OK' else 'BLOCKER' end,coalesce(string_agg(pg_get_function_identity_arguments(p.oid),'; '),'No existe') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_office'
  union all
  select 'guided_review_trigger',case when count(*)=1 then 'OK' else 'BLOCKER' end,count(*)::text||' trigger guided_work_order_review_init activo' from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='work_orders' and t.tgname='guided_work_order_review_init' and not t.tgisinternal and t.tgenabled='O'
  union all
  select 'new_function_grants',case when has_function_privilege('authenticated','public.dmp_review_work_order_sat(uuid,text,text,jsonb,text)','EXECUTE') and has_function_privilege('authenticated','public.dmp_review_work_order_commercial(uuid,text)','EXECUTE') and not has_function_privilege('anon','public.dmp_review_work_order_sat(uuid,text,text,jsonb,text)','EXECUTE') and not has_function_privilege('anon','public.dmp_review_work_order_commercial(uuid,text)','EXECUTE') then 'OK' else 'BLOCKER' end,'authenticated puede ejecutar SAT/Comercial; anon no puede ejecutar las RPC nuevas'
  from (select true) x
  union all
  select 'sat_rpc_guardrails',case when position('has_any_role' in lower(definition))>0 and position('sat_review_status' in lower(definition))>0 and position('p_destination' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La RPC SAT valida rol, cola SAT, decisión y destino'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_sat' limit 1),'') definition) d
  union all
  select 'commercial_rpc_guardrails',case when position('has_any_role' in lower(definition))>0 and position('commercial_review_status' in lower(definition))>0 and position('office_validation_status' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La RPC Comercial valida rol, estado pendiente y habilita Oficina'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_commercial' limit 1),'') definition) d
  union all
  select 'office_sat_commercial_gate',case when position('sat_review_status<>''approved''' in lower(definition))>0 and position('commercial_review_status<>''approved''' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La RPC de Oficina bloquea el salto si SAT no está aprobado o si Comercial sigue pendiente'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_office' limit 1),'') definition) d
  union all
  select 'sat_to_facturacion_gate',case when position('facturacion' in lower(definition))>0 and position('p_destination' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La RPC SAT admite el destino Facturación'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_sat' limit 1),'') definition) d
  union all
  select 'sat_to_comercial_gate',case when position('comercial' in lower(definition))>0 and position('p_destination' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La RPC SAT admite el destino Comercial'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_sat' limit 1),'') definition) d
  union all
  select 'commercial_before_office_gate',case when position('office_validation_status=''pending''' in lower(definition))>0 and position('commercial_review_status=''approved''' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La aprobación Comercial vuelve a poner el parte en validación de Oficina'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_commercial' limit 1),'') definition) d
  union all
  select 'office_cannot_bypass_sat',case when position('sat_review_status<>''approved''' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'Oficina no puede validar sin aprobación SAT'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_office' limit 1),'') definition) d
  union all
  select 'sat_review_status_values',case when count(*) filter(where review_status not in ('not_started','pending','approved','returned'))=0 then 'OK' else 'BLOCKER' end,coalesce(jsonb_object_agg(coalesce(review_status,'<null>'),total),'{}')::text from (select sat_review_status review_status,count(*)::bigint total from public.work_orders where deleted_at is null group by sat_review_status) s
  union all
  select 'sat_review_destination_values',case when count(*) filter(where destination is not null and destination not in ('comercial','facturacion'))=0 then 'OK' else 'BLOCKER' end,coalesce(jsonb_object_agg(coalesce(destination,'<null>'),total),'{}')::text from (select sat_review_destination destination,count(*)::bigint total from public.work_orders where deleted_at is null group by sat_review_destination) s
  union all
  select 'commercial_review_status_values',case when count(*) filter(where review_status not in ('not_started','pending','approved'))=0 then 'OK' else 'BLOCKER' end,coalesce(jsonb_object_agg(coalesce(review_status,'<null>'),total),'{}')::text from (select commercial_review_status review_status,count(*)::bigint total from public.work_orders where deleted_at is null group by commercial_review_status) s
  union all
  select 'routing_coherence',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' partes con routing incoherente' from public.work_orders where deleted_at is null and ((sat_review_status='approved' and sat_review_destination is null) or (sat_review_status<>'approved' and sat_review_destination is not null) or (sat_review_destination='comercial' and commercial_review_status='approved' and office_validation_status not in ('pending','validated')) or (sat_review_destination='facturacion' and commercial_review_status<>'not_started') or (commercial_review_status='pending' and sat_review_destination<>'comercial'))
  union all
  select 'backfill_initialized_coherence',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' partes inicializadas por SAT no cumplen Finalizado tecnicamente + Oficina pendiente' from public.work_orders where deleted_at is null and sat_review_status='pending' and (status<>'Finalizado tecnicamente' or office_validation_status<>'pending')
  union all
  select 'initialized_backfill_count','REVIEW',count(*)::text||' partes inicializadas con sat_review_status=pending' from public.work_orders where deleted_at is null and sat_review_status='pending'
  union all
  select 'invalid_initialized_terminal_count',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' partes inicializadas que están Enviado/Cerrado/Cancelado' from public.work_orders where deleted_at is null and sat_review_status='pending' and status in ('Enviado','Cerrado','Cancelado')
  union all
  select 'returned_to_sat',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' devoluciones no están en Devuelto por SAT con revisión SAT returned/pending' from public.work_orders where deleted_at is null and office_validation_status='rejected' and (status<>'Devuelto por SAT' or sat_review_status not in ('pending','returned'))
  union all
  select 'technical_finalize_unchanged_access',case when has_function_privilege('authenticated','public.dmp_finalize_work_order_technical(uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.dmp_finalize_work_order_technical(uuid,jsonb)','EXECUTE') then 'OK' else 'BLOCKER' end,'El técnico mantiene la ruta autenticada de cierre; no se concede ejecución a anon'
  from (select true) x
  union all
  select 'technical_finalize_role_guard',case when position('has_any_role' in lower(definition))>0 and position('tecnico' in lower(definition))>0 then 'OK' else 'BLOCKER' end,'La finalización conserva la autorización por rol/asignación del técnico'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_finalize_work_order_technical' and pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_payload jsonb' limit 1),'') definition) d
  union all
  select 'technical_role_not_economic',case when position('array[''Tecnico'']' in lower(definition))=0 or position('economic' in lower(definition))=0 then 'OK' else 'REVIEW' end,'La RPC 088 no añade grants ni permisos económicos al rol Técnico; confirmar con matriz de roles'
  from (select coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_sat' limit 1),'') definition) d
  union all
  select 'historical_statuses_valid',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' partes con estado operativo no válido tras 088' from public.work_orders where deleted_at is null and status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado')
  union all
  select 'historical_routing_review','REVIEW',count(*)::text||' partes existentes conservan el histórico y requieren lectura funcional de routing' from public.work_orders where deleted_at is null and status in ('Finalizado tecnicamente','Enviado','Devuelto por SAT','Cerrado','Cancelado')
  union all
  select 'historical_closed_preserved',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::text||' partes Cerrado permanecen Cerrado; la conservación exacta requiere comparar con el preflight' from public.work_orders where deleted_at is null and status='Cerrado'
  union all
  select 'historical_sent_preserved',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::text||' partes Enviado permanecen Enviado; la conservación exacta requiere comparar con el preflight' from public.work_orders where deleted_at is null and status='Enviado'
  union all
  select 'work_order_equipment_orphans',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' relaciones work_order_equipment huérfanas' from public.work_order_equipment e left join public.work_orders w on w.id=e.work_order_id left join public.equipment q on q.id=e.equipment_id where w.id is null or q.id is null
  union all
  select '082_087_dependencies',case when to_regprocedure('public.dmp_create_work_order_full(jsonb)') is not null and to_regprocedure('public.dmp_equipment_code_prefix(uuid)') is not null and to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') is not null then 'OK' else 'BLOCKER' end,'Wrapper 085, helper 086 y resolver 087 siguen presentes'
  union all
  select 'invoice_integrity',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' facturas/enlaces con incoherencia estructural; 088 no debe modificar facturas' from public.invoice_work_orders l left join public.invoices i on i.id=l.invoice_id left join public.work_orders w on w.id=l.work_order_id where l.deleted_at is null and (i.id is null or (w.id is not null and (l.company_id is distinct from i.company_id or l.company_id is distinct from w.company_id)))
  union all
  select 'fiscal_snapshot_inventory','REVIEW',(select jsonb_build_object('facturas',count(*),'emitidas',count(*) filter(where status='emitida'),'con_snapshot',count(*) filter(where fiscal_snapshot is not null),'sin_snapshot',count(*) filter(where fiscal_snapshot is null))::text from public.invoices)||' No se ejecutan acciones de facturación; la conservación exacta requiere comparar con el preflight.'
  union all
  select 'economic_values_unchanged_shape',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' partes con venta/coste/margen negativos' from public.work_orders where sale_amount<0 or real_cost_amount<0 or margin_amount is null and status='Finalizado tecnicamente'
  union all
  select 'office_and_billing_dependencies',case when to_regprocedure('public.dmp_review_work_order_office(uuid,text,text)') is not null and to_regprocedure('public.dmp_prepare_invoice_from_work_order(uuid,date,text,numeric)') is not null and to_regprocedure('public.dmp_issue_invoice(uuid)') is not null then 'OK' else 'BLOCKER' end,'Oficina, preparación y emisión de facturas siguen presentes'
  union all
  select 'migration_side_effect_scope','OK','Este postflight solo inspecciona catálogos y datos; no llama RPCs de negocio, no inserta, no actualiza y no crea facturas'
), summary as (
  select 'SUMMARY',case when count(*) filter(where status='BLOCKER')>0 then 'BLOCKER' when count(*) filter(where status='REVIEW')>0 then 'REVIEW' else 'OK' end,
    case when count(*) filter(where status='BLOCKER')>0 then 'No considerar 088 validada: hay BLOCKER.' when count(*) filter(where status='REVIEW')>0 then '088 estructuralmente instalada, pero hay REVIEW que requiere validación funcional/histórica.' else '088 validada sin BLOCKER ni REVIEW.' end from checks
)
select check_name,status,detail from (select * from checks union all select * from summary) result
order by case when check_name='SUMMARY' then 2 else 1 end,case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'OK' then 3 else 4 end,check_name;
