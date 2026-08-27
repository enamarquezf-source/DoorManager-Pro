-- Read-only postcheck for 073_office_validation_and_additional_sales.sql.
-- Run after 073 and after postcheck 072 succeeds. Returns one result set.

with checks(check_group, check_name, status, affected_rows, details) as (
  select '073', 'required_columns',
    case when count(*) = 8 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' de 8 columnas 073 presentes'
  from information_schema.columns
  where table_schema = 'public'
    and ((table_name = 'work_orders' and column_name in (
      'office_validation_status', 'office_validated_at',
      'office_validated_by', 'office_validation_reason'
    )) or (table_name = 'work_order_materials' and column_name in (
      'source', 'contributes_to_sale'
    )) or (table_name = 'work_order_time_entries' and column_name in (
      'source', 'contributes_to_sale'
    )))

  union all
  select '073', 'required_functions',
    case when count(*) = 2 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' de 2 funciones 073 presentes'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and ((p.proname = 'dmp_finalize_work_order_technical'
      and pg_get_function_identity_arguments(p.oid) = 'p_work_order_id uuid, p_payload jsonb')
      or (p.proname = 'dmp_review_work_order_office'
      and pg_get_function_identity_arguments(p.oid) = 'p_work_order_id uuid, p_decision text, p_reason text'))

  union all
  select '073', 'required_trigger',
    case when count(*) = 1 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' trigger de clasificación de materiales previstos habilitado'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'work_order_planned_material_decisions'
    and t.tgname = 'planned_material_billing_source_trigger'
    and not t.tgisinternal
    and t.tgenabled = 'O'

  union all
  select '073', 'required_grants',
    case when bool_and(
      has_function_privilege('authenticated', 'public.dmp_finalize_work_order_technical(uuid,jsonb)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_review_work_order_office(uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_finalize_work_order_technical(uuid,jsonb)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_review_work_order_office(uuid,text,text)', 'EXECUTE')
    ) then 'OK' else 'BLOCKER' end,
    case when has_function_privilege('authenticated', 'public.dmp_finalize_work_order_technical(uuid,jsonb)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.dmp_review_work_order_office(uuid,text,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_finalize_work_order_technical(uuid,jsonb)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.dmp_review_work_order_office(uuid,text,text)', 'EXECUTE')
      then 2 else 0 end,
    'EXECUTE solo para authenticated en cierre y validación de oficina'
  from (select true) one

  union all
  select '073', 'rls_structural_permissions',
    case when count(*) = 3 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' de 3 tablas operativas con RLS habilitado'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('work_orders', 'work_order_materials', 'work_order_time_entries')
    and c.relrowsecurity

  union all
  select '073', 'quote_transition_compatibility_with_072',
     case when positions.send_position > 0
       and positions.else_position > positions.send_position
       and positions.non_send_update_position > positions.else_position
       and positions.non_send_returning_position > positions.non_send_update_position
       and strpos(substring(definition from positions.send_position for positions.else_position - positions.send_position), 'sent_at =') > 0
       and strpos(substring(definition from positions.send_position for positions.else_position - positions.send_position), 'sent_to_email =') > 0
       and strpos(substring(definition from positions.non_send_update_position for positions.non_send_returning_position - positions.non_send_update_position), 'sent_at =') = 0
       and strpos(substring(definition from positions.non_send_update_position for positions.non_send_returning_position - positions.non_send_update_position), 'sent_to_email =') = 0
       then 'OK' else 'BLOCKER' end,
     case when positions.send_position > 0
       and positions.else_position > positions.send_position
       and positions.non_send_update_position > positions.else_position
       and positions.non_send_returning_position > positions.non_send_update_position
       and strpos(substring(definition from positions.send_position for positions.else_position - positions.send_position), 'sent_at =') > 0
       and strpos(substring(definition from positions.send_position for positions.else_position - positions.send_position), 'sent_to_email =') > 0
       and strpos(substring(definition from positions.non_send_update_position for positions.non_send_returning_position - positions.non_send_update_position), 'sent_at =') = 0
       and strpos(substring(definition from positions.non_send_update_position for positions.non_send_returning_position - positions.non_send_update_position), 'sent_to_email =') = 0
       then 0 else 1 end,
     case when positions.send_position > 0
       and positions.else_position > positions.send_position
       and positions.non_send_update_position > positions.else_position
       and positions.non_send_returning_position > positions.non_send_update_position
       and strpos(substring(definition from positions.send_position for positions.else_position - positions.send_position), 'sent_at =') > 0
       and strpos(substring(definition from positions.send_position for positions.else_position - positions.send_position), 'sent_to_email =') > 0
       and strpos(substring(definition from positions.non_send_update_position for positions.non_send_returning_position - positions.non_send_update_position), 'sent_at =') = 0
       and strpos(substring(definition from positions.non_send_update_position for positions.non_send_returning_position - positions.non_send_update_position), 'sent_to_email =') = 0
       then 'La ruta Enviado conserva la escritura de envío y las demás transiciones excluyen sent_at/sent_to_email'
       else 'La función no separa correctamente la ruta Enviado de las demás transiciones' end
   from (
     select definition,
       strpos(definition, 'if p_new_status = ''enviado'' then') as send_position,
       case when strpos(definition, 'if p_new_status = ''enviado'' then') > 0
         then strpos(substring(definition from strpos(definition, 'if p_new_status = ''enviado'' then')), 'else') + strpos(definition, 'if p_new_status = ''enviado'' then') - 1
         else 0 end as else_position
     from (
       select lower(coalesce((select pg_get_functiondef(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'dmp_quote_transition_apply'
          and pg_get_function_identity_arguments(p.oid) = 'p_quote_id uuid, p_new_status text, p_reason text, p_sent_to_email text, p_actor uuid'
        limit 1), '')) as definition
       ) source_definition
   ) initial_positions
   cross join lateral (
     select initial_positions.definition, initial_positions.send_position, initial_positions.else_position,
        case when initial_positions.else_position > 0
         then strpos(substring(initial_positions.definition from initial_positions.else_position), 'update public.quotes') + initial_positions.else_position - 1
         else 0 end as non_send_update_position
   ) update_positions
   cross join lateral (
     select update_positions.definition, update_positions.send_position, update_positions.else_position, update_positions.non_send_update_position,
       case when update_positions.non_send_update_position > 0
         then strpos(substring(update_positions.definition from update_positions.non_send_update_position), 'returning * into') + update_positions.non_send_update_position - 1
         else 0 end as non_send_returning_position
   ) positions

  union all
  select '073', 'tenant_mismatch',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' partes, materiales u horas cruzan empresa'
  from (
    select w.id
    from public.work_orders w
    left join public.quotes q on q.id = w.quote_id
    where w.quote_id is not null and (q.id is null or q.company_id is distinct from w.company_id)
    union
    select e.work_order_id
    from public.work_order_materials e
    join public.work_orders w on w.id = e.work_order_id
    where e.company_id is distinct from w.company_id
    union
    select e.work_order_id
    from public.work_order_time_entries e
    join public.work_orders w on w.id = e.work_order_id
    where e.company_id is distinct from w.company_id
  ) mismatches

  union all
  select '073', 'office_status_distribution',
    'INFO',
    count(*)::bigint,
    coalesce(jsonb_object_agg(office_validation_status, total), '{}'::jsonb)::text
  from (
    select office_validation_status, count(*)::bigint total
    from public.work_orders
    where deleted_at is null
    group by office_validation_status
  ) distribution

  union all
  select '073', 'invalid_office_state',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' partes con combinación imposible de estado oficina/económico/operativo'
  from public.work_orders
  where deleted_at is null
    and (
      office_validation_status not in ('not_started', 'pending', 'validated', 'rejected')
      or (office_validation_status = 'pending'
        and (status <> 'Finalizado tecnicamente' or economic_status <> 'pendiente_validacion'))
      or (office_validation_status = 'rejected'
        and (status <> 'Devuelto por SAT' or economic_status <> 'pendiente'))
      or (office_validation_status = 'validated'
        and (office_validated_at is null or office_validated_by is null or nullif(trim(office_validation_reason), '') is null))
    )

  union all
  select '073', 'historical_validation_not_invented',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' partes históricos pendientes de facturación aparecen validados sin evidencia completa'
  from public.work_orders
  where deleted_at is null
    and economic_status = 'pendiente_facturar'
    and office_validation_status = 'validated'
    and (office_validated_at is null or office_validated_by is null or nullif(trim(office_validation_reason), '') is null)

  union all
  select '073', 'historical_pending_invoice_report',
    'INFO',
    count(*)::bigint,
    count(*)::text || ' partes históricos siguen pendientes de facturación; requieren validación explícita'
  from public.work_orders
  where deleted_at is null
    and economic_status = 'pendiente_facturar'

  union all
  select '073', 'quoted_material_backfill',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' consumos asociados a presupuesto no tratados como quote/no venta adicional'
  from public.work_order_materials e
  join public.work_orders w on w.id = e.work_order_id
  where w.quote_id is not null
    and e.source <> 'quote'

  union all
  select '073', 'quoted_time_backfill',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' horas asociadas a presupuesto no tratadas como quote/no venta adicional'
  from public.work_order_time_entries e
  join public.work_orders w on w.id = e.work_order_id
  where w.quote_id is not null
    and e.source <> 'quote'

  union all
  select '073', 'quoted_materials_contributing_to_sale',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' consumos presupuestados contribuyen incoherentemente a venta'
  from public.work_order_materials e
  join public.work_orders w on w.id = e.work_order_id
  where w.quote_id is not null
    and e.source = 'quote'
    and e.contributes_to_sale

  union all
  select '073', 'quoted_time_contributing_to_sale',
    case when count(*) = 0 then 'OK' else 'BLOCKER' end,
    count(*)::bigint,
    count(*)::text || ' horas presupuestadas contribuyen incoherentemente a venta'
  from public.work_order_time_entries e
  join public.work_orders w on w.id = e.work_order_id
  where w.quote_id is not null
    and e.source = 'quote'
    and e.contributes_to_sale

  union all
  select '073', 'historical_snapshot_integrity',
    case when count(*) = 0 then 'OK' else 'REVIEW' end,
    count(*)::bigint,
    count(*)::text || ' consumos/horas con snapshot económico incompleto; 073 no debe recalcularlos'
  from (
    select e.id
    from public.work_order_materials e
    join public.work_orders w on w.id = e.work_order_id
    where w.quote_id is not null
       and (e.used_quantity is null or e.unit_cost is null or e.unit_price is null or e.total_cost is null or e.total_price is null)
    union all
    select e.id
    from public.work_order_time_entries e
    join public.work_orders w on w.id = e.work_order_id
    where w.quote_id is not null
      and (e.duration_minutes is null or e.hourly_cost is null or e.hourly_price is null or e.total_cost is null or e.total_price is null)
  ) incomplete_snapshots

  union all
  select '073', 'quoted_quote_status_coherence',
    case when count(*) = 0 then 'OK' else 'REVIEW' end,
    count(*)::bigint,
    count(*)::text || ' partes validados con presupuesto que no figura Ejecutado en cliente'
  from public.work_orders w
  join public.quotes q on q.id = w.quote_id and q.company_id = w.company_id
  where w.deleted_at is null
    and w.office_validation_status = 'validated'
    and q.status <> 'Ejecutado en cliente'
), summary(check_group, check_name, status, affected_rows, details) as (
  select 'SUMMARY', 'postcheck_073',
    case
      when count(*) filter (where status = 'BLOCKER') > 0 then 'BLOCKER'
      when count(*) filter (where status = 'REVIEW') > 0 then 'REVIEW'
      else 'OK'
    end,
    count(*) filter (where status in ('BLOCKER', 'REVIEW'))::bigint,
    case
      when count(*) filter (where status = 'BLOCKER') > 0 then 'No considerar 073 validada.'
      when count(*) filter (where status = 'REVIEW') > 0 then 'Revisar los controles marcados.'
      else '073 validada sin BLOCKER ni REVIEW.'
    end
  from checks
)
select check_group, check_name, status, affected_rows, details
from (
  select * from checks
  union all
  select * from summary
) result
order by
  case check_group when '073' then 1 else 2 end,
  case status when 'BLOCKER' then 1 when 'REVIEW' then 2 when 'INFO' then 3 when 'OK' then 4 else 5 end,
  check_name;
