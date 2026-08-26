-- DoorManager Pro - incomplete business data warns but does not block finish.
-- Structural integrity remains enforced by the section-result trigger.

begin;

create or replace function public.finish_check_safe(p_check_id uuid, p_observations text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_check public.checks;
  v_global_result text;
begin
  select * into v_check from public.checks
  where id = p_check_id and deleted_at is null for update;
  if v_check.id is null then raise exception 'Check no encontrado'; end if;
  perform public.assert_member_of_current_company(v_check.company_id);
  if not (public.has_any_role(array['superadmin','SAT','Gerencia']) or v_check.technician_id = v_profile_id or public.is_assigned_to_work_order(v_check.work_order_id, v_profile_id)) then
    raise exception 'No tienes permisos para finalizar este check';
  end if;

  select case
    when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'No favorable') then 'No favorable'
    when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'Problema leve') then 'Problema leve'
    when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'Favorable tras intervencion') then 'Favorable tras intervencion'
    else 'Todo favorable'
  end into v_global_result;

  perform public.finish_check(p_check_id, v_profile_id, v_global_result, p_observations);
  return v_global_result;
end;
$$;

revoke all on function public.finish_check_safe(uuid, text) from public;
revoke all on function public.finish_check_safe(uuid, text) from anon;
grant execute on function public.finish_check_safe(uuid, text) to authenticated;

commit;
