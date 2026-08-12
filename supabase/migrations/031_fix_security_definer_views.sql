-- DoorManager Pro - fuerza invoker rights en vistas operativas heredadas.
-- Mantiene las definiciones actuales y fuerza que se apliquen permisos/RLS del usuario invocador.

begin;

do $$
declare
  v_view text;
  v_views text[] := array[
    'v_open_work_orders',
    'v_equipment_history',
    'v_completed_checks',
    'v_unread_alerts',
    'v_sat_dashboard',
    'v_management_metrics'
  ];
begin
  foreach v_view in array v_views loop
    if to_regclass(format('public.%I', v_view)) is null then
      raise exception 'Vista esperada no encontrada: public.%', v_view;
    end if;

    execute format('alter view public.%I set (security_invoker = true)', v_view);
  end loop;
end $$;

commit;
