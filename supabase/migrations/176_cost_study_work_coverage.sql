-- Expand work coverage beyond time entries. Preserve immutable saved studies and monetary calculations.
begin;
create or replace function public.dmp_cost_study_sources(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles; result jsonb;
begin
  actor := public.dmp_active_profile();
  if not public.has_any_role(array['superadmin','Gerencia']) then raise exception 'No tienes permiso para consultar estudios de costes'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then raise exception 'El periodo debe tener entre 1 y 366 días'; end if;
  with scoped_works as (
    select w.id,w.code,w.type,w.status,w.warranty,w.estimated_duration_minutes,
      exists(select 1 from public.work_order_time_entries t where t.company_id = actor.company_id and t.work_order_id = w.id and t.work_date between p_from and p_to) as has_hours,
      exists(select 1 from public.work_order_materials m where m.company_id = actor.company_id and m.work_order_id = w.id and m.deleted_at is null and m.used_at between p_from and p_to) as has_materials,
      exists(select 1 from public.work_order_cost_entries r where r.company_id = actor.company_id and r.work_order_id = w.id and r.deleted_at is null and r.incurred_at between p_from and p_to) as has_resources,
      exists(select 1 from public.invoice_work_orders l join public.invoices i on i.id = l.invoice_id and i.company_id = l.company_id
        where l.company_id = actor.company_id and l.work_order_id = w.id and l.deleted_at is null and i.status not in ('borrador','cancelada') and i.issue_date between p_from and p_to) as invoiced_in_period,
      coalesce(w.status in ('Finalizado tecnicamente','Enviado','Cerrado') and (w.finished_at at time zone 'Europe/Madrid')::date between p_from and p_to,false) as completed_in_period,
      coalesce(w.deleted_at is null and w.scheduled_date between p_from and p_to,false) as scheduled_in_period
    from public.work_orders w where w.company_id = actor.company_id
  )
  select jsonb_build_object(
    'captured_at',now(),'work_scope_version',2,'period_from',p_from,'period_to',p_to,
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name) order by p.id) from public.profiles p where p.company_id = actor.company_id),'[]'::jsonb),
    'works',coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from scoped_works w
      where w.has_hours or w.has_materials or w.has_resources or w.invoiced_in_period or w.completed_in_period or w.scheduled_in_period),'[]'::jsonb),
    'time_entries',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'profile_id',t.profile_id,'work_order_id',t.work_order_id,'work_date',t.work_date,'duration_minutes',t.duration_minutes,'hour_type',t.hour_type,'total_cost',t.total_cost) order by t.id)
      from public.work_order_time_entries t join public.work_orders w on w.id = t.work_order_id and w.company_id = t.company_id
      where t.company_id = actor.company_id and t.work_date between p_from and p_to),'[]'::jsonb),
    'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'work_order_id',m.work_order_id,'total_cost',m.total_cost) order by m.id)
      from public.work_order_materials m join public.work_orders w on w.id = m.work_order_id and w.company_id = m.company_id
      where m.company_id = actor.company_id and m.deleted_at is null and m.used_at between p_from and p_to),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'work_order_id',r.work_order_id,'total_cost',r.total_cost) order by r.id)
      from public.work_order_cost_entries r join public.work_orders w on w.id = r.work_order_id and w.company_id = r.company_id
      where r.company_id = actor.company_id and r.deleted_at is null and r.incurred_at between p_from and p_to),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'subtotal',i.subtotal) order by i.id) from public.invoices i
      where i.company_id = actor.company_id and i.status not in ('borrador','cancelada') and i.issue_date between p_from and p_to),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.dmp_cost_study_sources(date,date) from public,anon;
grant execute on function public.dmp_cost_study_sources(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
