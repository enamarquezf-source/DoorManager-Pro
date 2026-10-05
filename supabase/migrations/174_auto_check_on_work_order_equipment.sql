-- Genera un check al asociar cualquier equipo a un parte.
-- La función existente es idempotente y conserva el check si ya existe.
begin;

create or replace function public.dmp_auto_check_for_work_order_equipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work public.work_orders;
  v_technician uuid;
begin
  select * into v_work
  from public.work_orders
  where id = new.work_order_id and deleted_at is null;
  if v_work.id is null then return new; end if;

  select coalesce(v_work.main_technician_id, v_work.current_responsible_id)
    into v_technician;

  -- Se usa Mantenimiento para que también los partes correctivos tengan
  -- check operativo cuando se les asocia un equipo.
  perform public.dmp_ensure_work_order_equipment_check(
    new.company_id, new.work_order_id, new.equipment_id,
    v_technician, 'Mantenimiento'
  );
  return new;
end;
$$;

drop trigger if exists trg_auto_check_work_order_equipment on public.work_order_equipment;
create trigger trg_auto_check_work_order_equipment
after insert on public.work_order_equipment
for each row execute function public.dmp_auto_check_for_work_order_equipment();

notify pgrst, 'reload schema';
commit;
