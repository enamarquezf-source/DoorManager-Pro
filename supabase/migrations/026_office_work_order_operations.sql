-- DoorManager Pro - habilita a Oficina para completar/revisar partes operativos.
-- No relaja RLS global: mantiene company_id, usuario activo y asignacion tecnica.

begin;

drop policy if exists work_order_time_entries_select_scoped on public.work_order_time_entries;
create policy work_order_time_entries_select_scoped on public.work_order_time_entries for select to authenticated
  using (
    (company_id = public.current_company_id()
      and (
        public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial'])
        or profile_id = public.current_profile_id()
        or exists (select 1 from public.work_order_assignments a where a.work_order_id = work_order_time_entries.work_order_id and a.technician_id = public.current_profile_id() and a.deleted_at is null and a.status not in ('Finalizado','Cancelado'))
      ))
    or public.is_platform_superadmin()
  );

do $$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.dmp024_assert_work_order_operator(uuid, boolean)',
    'public.dmp_diagnose_work_order_operation(uuid)',
    'public.dmp_upsert_work_order_material(jsonb)',
    'public.dmp_change_work_order_status(uuid, text, text)',
    'public.dmp025_assert_time_target(uuid, uuid)',
    'public.dmp_work_order_time_worker_options(uuid)',
    'public.dmp_upsert_work_order_time_entry(jsonb)',
    'public.dmp_delete_work_order_time_entry(uuid, text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      v_definition := pg_get_functiondef(to_regprocedure(v_signature));
      v_definition := replace(v_definition, 'array[''superadmin'', ''SAT'', ''Gerencia'']', 'array[''superadmin'', ''SAT'', ''Gerencia'', ''Oficina'']');
      v_definition := replace(v_definition, 'array[''superadmin'',''SAT'',''Gerencia'']', 'array[''superadmin'',''SAT'',''Gerencia'',''Oficina'']');
      execute v_definition;
    end if;
  end loop;
end $$;

commit;
