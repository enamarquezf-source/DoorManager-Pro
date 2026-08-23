-- DoorManager Pro - resuelve las horas con el catalogo canonico de tarifas.
-- 061 archiva los conceptos legacy-hour-*; las nuevas horas usan el concepto
-- laboral canonico tecnico y conservan el snapshot economico en la entrada.

begin;

create or replace function public.dmp_upsert_work_order_time_entry(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp025_actor_profile();
  v_work public.work_orders;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_profile uuid := coalesce(nullif(p_payload->>'profile_id', '')::uuid, v_actor.id);
  v_date date := coalesce(nullif(p_payload->>'work_date', '')::date, current_date);
  v_duration integer;
  v_requested uuid := nullif(p_payload->>'rate_id', '')::uuid;
  v_canonical_rate_id uuid;
  v_rate record;
  v_old public.work_order_time_entries;
  v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']);
begin
  v_work := public.dmp025_assert_time_target((p_payload->>'work_order_id')::uuid, v_profile);
  v_duration := public.dmp024_work_minutes(
    nullif(p_payload->>'started_at', '')::time,
    nullif(p_payload->>'ended_at', '')::time,
    coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0),
    nullif(p_payload->>'duration_minutes', '')::integer
  );

  if v_id is not null then
    select * into v_old
    from public.work_order_time_entries
    where id = v_id and company_id = v_work.company_id and work_order_id = v_work.id
    for update;
    if v_old.id is null or not (v_admin or v_old.created_by = v_actor.id) then
      raise exception 'permiso: registro de horas no editable para este usuario';
    end if;
  end if;

  if v_id is not null and v_requested is null then
    v_rate.rate_id := v_old.rate_id;
    v_rate.rate_version_id := v_old.rate_version_id;
    v_rate.cost_amount := v_old.hourly_cost;
    v_rate.sale_amount := v_old.hourly_price;
    v_rate.unit := 'h';
    v_rate.billing_mode := 'hour';
    v_rate.period_days := null;
  else
    if v_requested is not null then
      if not exists (
        select 1 from public.rate_catalog c
        where c.id = v_requested
          and c.company_id = v_work.company_id
          and c.code = 'tecnico'
          and c.classification = 'labor'
          and c.active and c.deleted_at is null
      ) then
        raise exception 'tarifa: rate_id no es la tarifa laboral canonica valida';
      end if;
      v_canonical_rate_id := v_requested;
    else
      select c.id into v_canonical_rate_id
      from public.rate_catalog c
      where c.company_id = v_work.company_id
        and c.code = 'tecnico'
        and c.classification = 'labor'
        and c.active and c.deleted_at is null;
      if v_canonical_rate_id is null then
        raise exception 'tarifa: no existe el concepto laboral canonico tecnico para la empresa';
      end if;
    end if;

    select * into v_rate
    from public.dmp_resolve_rate(v_canonical_rate_id, v_profile, v_date);
  end if;

  if v_rate.rate_version_id is null then
    raise exception 'tarifa: no existe una tarifa horaria vigente aplicable al tecnico para la fecha indicada';
  end if;

  if v_id is not null then
    update public.work_order_time_entries
    set profile_id = v_profile,
        work_date = v_date,
        started_at = nullif(p_payload->>'started_at', '')::time,
        ended_at = nullif(p_payload->>'ended_at', '')::time,
        break_minutes = coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0),
        duration_minutes = v_duration,
        manual_duration = nullif(p_payload->>'started_at', '') is null,
        hour_type = coalesce(nullif(p_payload->>'hour_type', ''), 'normal'),
        hourly_cost = coalesce(v_rate.cost_amount, 0),
        hourly_price = coalesce(v_rate.sale_amount, 0),
        total_cost = round(v_duration::numeric / 60 * coalesce(v_rate.cost_amount, 0), 2),
        total_price = round(v_duration::numeric / 60 * coalesce(v_rate.sale_amount, 0), 2),
        description = trim(coalesce(p_payload->>'description', '')),
        rate_id = v_rate.rate_id,
        rate_version_id = v_rate.rate_version_id,
        billing_mode = v_rate.billing_mode,
        period_days = v_rate.period_days,
        updated_by = v_actor.id,
        updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.work_order_time_entries(
    company_id, work_order_id, profile_id, work_date, started_at, ended_at,
    break_minutes, duration_minutes, manual_duration, hour_type,
    hourly_cost, hourly_price, total_cost, total_price, description,
    created_by, updated_by, rate_id, rate_version_id, billing_mode, period_days
  )
  values (
    v_work.company_id, v_work.id, v_profile, v_date,
    nullif(p_payload->>'started_at', '')::time,
    nullif(p_payload->>'ended_at', '')::time,
    coalesce(nullif(p_payload->>'break_minutes', '')::integer, 0),
    v_duration,
    nullif(p_payload->>'started_at', '') is null,
    coalesce(nullif(p_payload->>'hour_type', ''), 'normal'),
    coalesce(v_rate.cost_amount, 0),
    coalesce(v_rate.sale_amount, 0),
    round(v_duration::numeric / 60 * coalesce(v_rate.cost_amount, 0), 2),
    round(v_duration::numeric / 60 * coalesce(v_rate.sale_amount, 0), 2),
    trim(coalesce(p_payload->>'description', '')),
    v_actor.id, v_actor.id, v_rate.rate_id, v_rate.rate_version_id,
    v_rate.billing_mode, v_rate.period_days
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from public;
revoke all on function public.dmp_upsert_work_order_time_entry(jsonb) from anon;
grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated;

commit;
