-- Immutable management studies. Source snapshots are collected by the server, not supplied by the browser.
begin;

create table if not exists public.cost_productivity_studies (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  title text not null check (length(trim(title)) between 1 and 160),
  period_from date not null,
  period_to date not null,
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  sources jsonb not null check (jsonb_typeof(sources) = 'object'),
  calculation_version integer not null default 1 check (calculation_version = 1),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (period_to >= period_from and period_to - period_from <= 365)
);
create index if not exists cost_productivity_studies_company_date_idx on public.cost_productivity_studies(company_id, created_at desc);
alter table public.cost_productivity_studies enable row level security;
revoke all on public.cost_productivity_studies from public, anon, authenticated;
grant select on public.cost_productivity_studies to authenticated;
drop policy if exists cost_productivity_studies_read on public.cost_productivity_studies;
create policy cost_productivity_studies_read on public.cost_productivity_studies for select to authenticated
using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia'])
  and exists(select 1 from public.profiles p where p.id = public.current_profile_id() and p.active and p.deleted_at is null));

create or replace function public.dmp_cost_study_sources(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles; result jsonb;
begin
  actor := public.dmp_active_profile();
  if not public.has_any_role(array['superadmin','Gerencia']) then raise exception 'No tienes permiso para consultar estudios de costes'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then raise exception 'El periodo debe tener entre 1 y 366 días'; end if;
  select jsonb_build_object(
    'captured_at', now(),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name) order by p.id)
      from public.profiles p where p.company_id = actor.company_id), '[]'::jsonb),
    'works', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'type', w.type, 'status', w.status, 'warranty', w.warranty, 'estimated_duration_minutes', w.estimated_duration_minutes) order by w.id)
      from public.work_orders w where w.company_id = actor.company_id
      and exists(select 1 from public.work_order_time_entries t where t.work_order_id = w.id and t.company_id = actor.company_id and t.work_date between p_from and p_to)), '[]'::jsonb),
    'time_entries', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'profile_id', t.profile_id, 'work_order_id', t.work_order_id, 'work_date', t.work_date, 'duration_minutes', t.duration_minutes, 'hour_type', t.hour_type, 'total_cost', t.total_cost) order by t.id)
      from public.work_order_time_entries t join public.work_orders w on w.id = t.work_order_id and w.company_id = t.company_id
      where t.company_id = actor.company_id and t.work_date between p_from and p_to), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'work_order_id', m.work_order_id, 'total_cost', m.total_cost) order by m.id)
      from public.work_order_materials m join public.work_orders w on w.id = m.work_order_id and w.company_id = m.company_id
      where m.company_id = actor.company_id and m.deleted_at is null and m.used_at between p_from and p_to), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'work_order_id', r.work_order_id, 'total_cost', r.total_cost) order by r.id)
      from public.work_order_cost_entries r join public.work_orders w on w.id = r.work_order_id and w.company_id = r.company_id
      where r.company_id = actor.company_id and r.deleted_at is null and r.incurred_at between p_from and p_to), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'subtotal', i.subtotal) order by i.id)
      from public.invoices i where i.company_id = actor.company_id and i.status not in ('borrador','cancelada') and i.issue_date between p_from and p_to), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.dmp_save_cost_study(p_id uuid, p_title text, p_from date, p_to date, p_inputs jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.profiles; employee jsonb; overhead jsonb; field text; numeric_value numeric; seen uuid[] := '{}'; employee_id uuid; previous public.cost_productivity_studies;
begin
  actor := public.dmp_active_profile();
  if not public.has_any_role(array['superadmin','Gerencia']) then raise exception 'No tienes permiso para guardar estudios de costes'; end if;
  if p_id is null or p_title is null or length(trim(p_title)) not between 1 and 160 then raise exception 'Indica un título de hasta 160 caracteres'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then raise exception 'El periodo debe tener entre 1 y 366 días'; end if;
  if p_inputs is null or jsonb_typeof(p_inputs) <> 'object'
    or jsonb_typeof(p_inputs->'employees') is distinct from 'array' or jsonb_typeof(p_inputs->'overheads') is distinct from 'array'
    or jsonb_typeof(p_inputs->'notes') is distinct from 'string'
    or pg_column_size(p_inputs) > 1048576 then raise exception 'Configuración de estudio no válida'; end if;
  if p_inputs->'cost_budget' is distinct from 'null'::jsonb then
    if jsonb_typeof(p_inputs->'cost_budget') is distinct from 'number' then raise exception 'Presupuesto no válido'; end if;
    numeric_value := (p_inputs->>'cost_budget')::numeric;
    if numeric_value < 0 or numeric_value > 1e12 then raise exception 'Presupuesto fuera de rango'; end if;
  end if;
  for employee in select value from jsonb_array_elements(p_inputs->'employees') loop
    employee_id := (employee->>'profile_id')::uuid;
    if employee_id is null or employee_id = any(seen) or not exists(select 1 from public.profiles p where p.id = employee_id and p.company_id = actor.company_id) then raise exception 'Empleado duplicado o fuera de la empresa'; end if;
    seen := array_append(seen, employee_id);
    foreach field in array array['payroll_cost','paid_hours','presence_hours','standard_completed_hours'] loop
      if not employee ? field then raise exception 'Falta un dato del empleado'; end if;
      if employee->field <> 'null'::jsonb then
        if jsonb_typeof(employee->field) <> 'number' then raise exception 'Importe u horas no válidos'; end if;
        numeric_value := (employee->>field)::numeric;
        if numeric_value < 0 or numeric_value > 1e12 then raise exception 'Importe u horas fuera de rango'; end if;
        if field in ('paid_hours','presence_hours') and numeric_value > (p_to-p_from+1)*24 then raise exception 'Las horas superan el periodo'; end if;
      end if;
    end loop;
    if jsonb_typeof(employee->'standard_basis') is distinct from 'string' then raise exception 'Falta la base del estándar'; end if;
    if employee->'standard_completed_hours' <> 'null'::jsonb and length(trim(employee->>'standard_basis')) = 0 then raise exception 'Explica la base del estándar de trabajo terminado'; end if;
  end loop;
  for overhead in select value from jsonb_array_elements(p_inputs->'overheads') loop
    if jsonb_typeof(overhead->'description') is distinct from 'string' or length(trim(overhead->>'description')) = 0
      or jsonb_typeof(overhead->'amount') is distinct from 'number' then raise exception 'Gasto general no válido'; end if;
    numeric_value := (overhead->>'amount')::numeric;
    if numeric_value < 0 or numeric_value > 1e12 then raise exception 'Importe de gasto fuera de rango'; end if;
  end loop;
  -- Retrying after a connection failure returns the first snapshot; never recreates it with changed data.
  perform pg_advisory_xact_lock(hashtextextended('dmp:cost-study:' || p_id::text, 0));
  select * into previous from public.cost_productivity_studies where id = p_id;
  if found then
    if previous.company_id <> actor.company_id or previous.created_by <> actor.id or previous.title <> trim(p_title)
      or previous.period_from <> p_from or previous.period_to <> p_to or previous.inputs <> p_inputs then raise exception 'La operación ya existe con otros datos'; end if;
    return previous.id;
  end if;
  insert into public.cost_productivity_studies(id,company_id,title,period_from,period_to,inputs,sources,created_by)
  values(p_id,actor.company_id,trim(p_title),p_from,p_to,p_inputs,public.dmp_cost_study_sources(p_from,p_to),actor.id);
  return p_id;
end;
$$;
revoke all on function public.dmp_cost_study_sources(date,date) from public, anon;
revoke all on function public.dmp_save_cost_study(uuid,text,date,date,jsonb) from public, anon;
grant execute on function public.dmp_cost_study_sources(date,date) to authenticated;
grant execute on function public.dmp_save_cost_study(uuid,text,date,date,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
