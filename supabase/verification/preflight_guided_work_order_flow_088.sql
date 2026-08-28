-- Read-only preflight for 088_guided_work_order_operational_flow.sql.
-- Run before 088. Returns exactly one result set: check_name, status, detail.

with checks(check_name,status,detail) as (
  select 'public_schema', case when exists(select 1 from pg_namespace where nspname='public') then 'OK' else 'BLOCKER' end,
    'Schema public '||case when exists(select 1 from pg_namespace where nspname='public') then 'existe' else 'no existe' end
  union all
  select 'required_tables', case when count(*)=10 then 'OK' else 'BLOCKER' end,
    count(*)::text||' de 10 tablas base presentes: work_orders, profiles, quotes, invoices, invoice_work_orders, work_order_assignments, work_order_notes, work_order_status_history, audit_log y checks'
  from information_schema.tables where table_schema='public' and table_name in ('work_orders','profiles','quotes','invoices','invoice_work_orders','work_order_assignments','work_order_notes','work_order_status_history','audit_log','checks')
  union all
  select 'required_work_order_columns', case when count(*)=16 then 'OK' else 'BLOCKER' end,
    count(*)::text||' de 16 columnas 088/flujo previo presentes en work_orders'
  from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name in ('status','economic_status','office_validation_status','office_validation_reason','office_validated_at','office_validated_by','warranty','billable','sale_amount','additional_sale_amount','finished_at','deleted_at','quote_id','company_id','updated_by','updated_at')
  union all
  select 'required_related_columns', case when count(*)=9 then 'OK' else 'BLOCKER' end,
    count(*)::text||' de 9 columnas de trazabilidad relacionadas presentes'
  from information_schema.columns where table_schema='public' and ((table_name='work_order_status_history' and column_name in ('work_order_id','previous_status','new_status','reason')) or (table_name='audit_log' and column_name in ('table_name','record_id','operation','old_data','new_data')))
  union all
  select 'technical_finalize_signature', case when count(*)=1 and bool_or(pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_payload jsonb') then 'OK' else 'BLOCKER' end,
    coalesce(string_agg(pg_get_function_identity_arguments(p.oid),'; '),'No existe')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_finalize_work_order_technical'
  union all
  select 'office_review_signature', case when count(*)=1 and bool_or(pg_get_function_identity_arguments(p.oid)='p_work_order_id uuid, p_decision text, p_reason text') then 'OK' else 'BLOCKER' end,
    coalesce(string_agg(pg_get_function_identity_arguments(p.oid),'; '),'No existe')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_office'
  union all
  select 'legacy_function_grants', case when has_function_privilege('authenticated','public.dmp_finalize_work_order_technical(uuid,jsonb)','EXECUTE') and has_function_privilege('authenticated','public.dmp_review_work_order_office(uuid,text,text)','EXECUTE') and not has_function_privilege('anon','public.dmp_finalize_work_order_technical(uuid,jsonb)','EXECUTE') and not has_function_privilege('anon','public.dmp_review_work_order_office(uuid,text,text)','EXECUTE') then 'OK' else 'BLOCKER' end,
    'Cierre técnico y oficina: authenticated='||has_function_privilege('authenticated','public.dmp_finalize_work_order_technical(uuid,jsonb)','EXECUTE')||', oficina='||has_function_privilege('authenticated','public.dmp_review_work_order_office(uuid,text,text)','EXECUTE')||', anon sin ejecución='||not has_function_privilege('anon','public.dmp_review_work_order_office(uuid,text,text)','EXECUTE')
  from (select true) x
  union all
  select 'current_status_values', case when count(*) filter(where status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado'))=0 then 'OK' else 'REVIEW' end,
    coalesce(jsonb_object_agg(status,total),'{}')::text
  from (select status,count(*)::bigint total from public.work_orders where deleted_at is null group by status) s
  union all
  select 'affected_work_order_counts','REVIEW',
    (select jsonb_build_object('finalizados_tecnicamente',count(*) filter(where status='Finalizado tecnicamente'),'pendientes_oficina',count(*) filter(where office_validation_status='pending'),'enviados',count(*) filter(where status='Enviado'),'devueltos_sat',count(*) filter(where status='Devuelto por SAT'),'cerrados',count(*) filter(where status='Cerrado'),'cancelados',count(*) filter(where status='Cancelado'))::text from public.work_orders where deleted_at is null)
  union all
  select 'backfill_candidate_count','REVIEW',count(*)::text||' filas coinciden con el conjunto pre-migración equivalente al backfill de 088' from public.work_orders where deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending'
  union all
  select 'backfill_terminal_state_count',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' filas del conjunto pre-migración están Enviado/Cerrado/Cancelado' from public.work_orders where deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending' and status in ('Enviado','Cerrado','Cancelado')
  union all
  select 'backfill_non_finalized_count',case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' filas del conjunto pre-migración no están Finalizado tecnicamente' from public.work_orders where deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending' and status<>'Finalizado tecnicamente'
  union all
  select 'backfill_status_distribution','REVIEW',coalesce(jsonb_object_agg(status,total),'{}')::text from (select status,count(*)::bigint total from public.work_orders where deleted_at is null and status='Finalizado tecnicamente' and office_validation_status='pending' group by status) candidates
  union all
  select 'historical_states_to_preserve', case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::text||' partes con estados terminales/históricos que 088 debe conservar' from public.work_orders where deleted_at is null and status in ('Finalizado tecnicamente','Enviado','Devuelto por SAT','Cerrado','Cancelado')
  union all
  select 'new_columns_pre_state', case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::text||' de las 10 columnas nuevas de 088 ya existen; revisar idempotencia antes de aplicar' from information_schema.columns where table_schema='public' and table_name='work_orders' and column_name in ('sat_review_status','sat_review_destination','sat_review_flags','sat_review_reason','sat_reviewed_at','sat_reviewed_by','commercial_review_status','commercial_review_reason','commercial_reviewed_at','commercial_reviewed_by')
  union all
  select 'new_functions_pre_state', case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::text||' de las 2 RPC nuevas ya existen' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('dmp_review_work_order_sat','dmp_review_work_order_commercial')
  union all
  select 'sat_current_flow','REVIEW',case when position('dmp_finalize_work_order_technical' in lower(coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_finalize_work_order_technical' limit 1),'')))>0 then 'La finalización técnica existe; el routing SAT actual no está persistido como destino' else 'No se pudo introspectar la finalización técnica' end
  union all
  select 'notes_and_history_dependencies', case when count(*)=3 then 'OK' else 'BLOCKER' end,count(*)::text||' de 3 mecanismos actuales presentes: notas, historial de estados y audit_log' from information_schema.tables where table_schema='public' and table_name in ('work_order_notes','work_order_status_history','audit_log')
  union all
  select 'commercial_current_flow','REVIEW',case when to_regprocedure('public.dmp_quote_transition_apply(uuid,text,text,text,uuid)') is not null then 'Existe transición segura de presupuesto; no existe aún aprobación Comercial específica del parte' else 'Falta transición segura de presupuesto' end
  union all
  select 'office_current_bypass','REVIEW',case when position('sat_review_status' in lower(coalesce((select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='dmp_review_work_order_office' limit 1),'')))=0 then 'La RPC de Oficina actual no conoce revisión SAT; 088 añadirá el bloqueo' else 'La RPC ya contiene lógica SAT' end
  union all
  select 'invoice_counts','REVIEW',(select jsonb_build_object('total',count(*),'emitidas',count(*) filter(where status='emitida'),'con_snapshot',count(*) filter(where fiscal_snapshot is not null),'sin_snapshot',count(*) filter(where fiscal_snapshot is null))::text from public.invoices)
  union all
  select 'invoice_dependency_integrity', case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' enlaces de factura cruzan empresa o parte inexistente' from public.invoice_work_orders l left join public.invoices i on i.id=l.invoice_id left join public.work_orders w on w.id=l.work_order_id where l.deleted_at is null and (i.id is null or (w.id is not null and (l.company_id is distinct from i.company_id or l.company_id is distinct from w.company_id)))
  union all
  select 'multi_equipment_dependencies', case when count(*)=5 then 'OK' else 'BLOCKER' end,count(*)::text||' de 5 tablas 082-087 esperadas presentes: work_order_equipment, check_templates, checks, check_section_results y equipment_types' from information_schema.tables where table_schema='public' and table_name in ('work_order_equipment','check_templates','checks','check_section_results','equipment_types')
  union all
  select 'multi_equipment_orphans', case when count(*)=0 then 'OK' else 'BLOCKER' end,count(*)::text||' relaciones work_order_equipment huérfanas' from public.work_order_equipment e left join public.work_orders w on w.id=e.work_order_id left join public.equipment q on q.id=e.equipment_id where w.id is null or q.id is null
  union all
  select '085_086_087_dependencies', case when to_regprocedure('public.dmp_create_work_order_full(jsonb)') is not null and to_regprocedure('public.dmp_equipment_code_prefix(uuid)') is not null and to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') is not null then 'OK' else 'BLOCKER' end,'085 wrapper='||(to_regprocedure('public.dmp_create_work_order_full(jsonb)') is not null)||', 086 prefix='||(to_regprocedure('public.dmp_equipment_code_prefix(uuid)') is not null)||', 087 resolver='||(to_regprocedure('public.dmp_resolve_check_template(uuid,uuid)') is not null)
  union all
  select 'business_role_permissions','REVIEW','Las RPCs usan has_any_role; la comprobación remota de perfiles SAT/Comercial/Oficina requiere datos autenticados y no se ejecuta en preflight'
  union all
  select 'status_constraints',case when count(*)=0 then 'OK' else 'REVIEW' end,count(*)::text||' constraints CHECK relacionadas con status/routing encontradas en work_orders; revisar antes de aplicar 088' from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='work_orders' and pg_get_constraintdef(c.oid) ilike '%status%'
  union all
  select 'migration_safety_review','REVIEW','088 contiene backfill restringido a Finalizado tecnicamente y trigger BEFORE UPDATE OF de columnas administrativas; no modifica invoices, costes ni precios'
), summary as (
  select 'SUMMARY',case when count(*) filter(where status='BLOCKER')>0 then 'BLOCKER' when count(*) filter(where status='REVIEW')>0 then 'REVIEW' else 'OK' end,
    case when count(*) filter(where status='BLOCKER')>0 then 'No aplicar 088: hay dependencias bloqueantes.' when count(*) filter(where status='REVIEW')>0 then 'Hay REVIEW: revisar estados históricos, backfill y bypass actual antes de aplicar 088.' else 'Preflight sin incidencias.' end from checks
)
select check_name,status,detail from (select * from checks union all select * from summary) result
order by case when check_name='SUMMARY' then 2 else 1 end,case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'OK' then 3 else 4 end,check_name;
