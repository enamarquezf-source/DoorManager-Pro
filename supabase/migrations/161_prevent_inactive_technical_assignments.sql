-- Impide que una asignacion aparentemente correcta quede invisible al tecnico.
begin;
create or replace function public.dmp_guard_active_technical_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_status text; v_deleted timestamptz;
begin
 if new.deleted_at is not null or new.status in ('Finalizado','Cancelado') then return new; end if;
 select w.status,w.deleted_at into v_status,v_deleted from public.work_orders w where w.id=new.work_order_id for update;
 if v_status is null or v_deleted is not null or v_status not in
  ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Devuelto por SAT') then
  raise exception 'validacion del formulario: este parte ya no admite trabajo tecnico. Crea otro parte o solicita su reapertura a SAT.';
 end if;
 return new;
end $$;
revoke all on function public.dmp_guard_active_technical_assignment() from public,anon,authenticated;
drop trigger if exists guard_active_technical_assignment on public.work_order_assignments;
create trigger guard_active_technical_assignment before insert or update on public.work_order_assignments
 for each row execute function public.dmp_guard_active_technical_assignment();
commit;
