-- These helpers are called by SECURITY DEFINER work-order RPCs, never directly
-- by the frontend. Keep the public, authorized operations unchanged.
begin;
revoke all on function public.dmp_ensure_work_order_equipment_check(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.dmp_resolve_check_template(uuid, uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
