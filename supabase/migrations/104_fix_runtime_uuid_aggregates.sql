-- DoorManager Pro - replace unsupported UUID aggregates with cardinality-controlled selections.
begin;

create or replace function public.resolve_check_technician_from_work_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_main_technician_id uuid;
  v_principal_count integer;
  v_principal_id uuid;
  v_active_count integer;
  v_active_id uuid;
begin
  if new.work_order_id is null then
    return new;
  end if;

  select wo.main_technician_id
    into v_main_technician_id
  from public.work_orders as wo
  join public.profiles as p on p.id = wo.main_technician_id
    and p.company_id = wo.company_id
    and p.active = true
    and p.deleted_at is null
    and lower(p.primary_area) = 'tecnico'
  where wo.id = new.work_order_id
    and wo.company_id = new.company_id
    and wo.deleted_at is null;

  if v_main_technician_id is not null then
    new.technician_id := v_main_technician_id;
    return new;
  end if;

  select count(distinct a.technician_id)
    into v_principal_count
  from public.work_order_assignments as a
  join public.work_orders as wo on wo.id = a.work_order_id
    and wo.company_id = new.company_id
    and wo.deleted_at is null
  join public.profiles as p on p.id = a.technician_id
    and p.company_id = new.company_id
    and p.active = true
    and p.deleted_at is null
    and lower(p.primary_area) = 'tecnico'
  where a.work_order_id = new.work_order_id
    and a.deleted_at is null
    and a.status not in ('Finalizado', 'Cancelado')
    and a.role = 'Principal';

  if v_principal_count = 1 then
    select a.technician_id
      into v_principal_id
    from public.work_order_assignments as a
    join public.work_orders as wo on wo.id = a.work_order_id
      and wo.company_id = new.company_id
      and wo.deleted_at is null
    join public.profiles as p on p.id = a.technician_id
      and p.company_id = new.company_id
      and p.active = true
      and p.deleted_at is null
      and lower(p.primary_area) = 'tecnico'
    where a.work_order_id = new.work_order_id
      and a.deleted_at is null
      and a.status not in ('Finalizado', 'Cancelado')
      and a.role = 'Principal'
    limit 1;
    new.technician_id := v_principal_id;
    return new;
  end if;

  if v_principal_count > 1 then
    new.technician_id := null;
    return new;
  end if;

  select count(distinct a.technician_id)
    into v_active_count
  from public.work_order_assignments as a
  join public.work_orders as wo on wo.id = a.work_order_id
    and wo.company_id = new.company_id
    and wo.deleted_at is null
  join public.profiles as p on p.id = a.technician_id
    and p.company_id = new.company_id
    and p.active = true
    and p.deleted_at is null
    and lower(p.primary_area) = 'tecnico'
  where a.work_order_id = new.work_order_id
    and a.deleted_at is null
    and a.status not in ('Finalizado', 'Cancelado');

  if v_active_count = 1 then
    select a.technician_id
      into v_active_id
    from public.work_order_assignments as a
    join public.work_orders as wo on wo.id = a.work_order_id
      and wo.company_id = new.company_id
      and wo.deleted_at is null
    join public.profiles as p on p.id = a.technician_id
      and p.company_id = new.company_id
      and p.active = true
      and p.deleted_at is null
      and lower(p.primary_area) = 'tecnico'
    where a.work_order_id = new.work_order_id
      and a.deleted_at is null
      and a.status not in ('Finalizado', 'Cancelado')
    limit 1;
  end if;

  new.technician_id := case when v_active_count = 1 then v_active_id else null end;
  return new;
end;
$$;

grant execute on function public.resolve_check_technician_from_work_order() to authenticated;

commit;
