-- Restore Office workflow and queue after 152. Safe to apply after 026/153.
-- Preserves current function bodies, company scope and financial audit guards.
begin;

create or replace function public.dmp_department_routing_queue(p_queue text)
returns table(id uuid,company_id uuid,code text,title text,client_name text,site_name text,equipment_names text,description text,quote_code text,sat_reviewed_at timestamptz,sat_reviewer_name text,sat_review_flags jsonb,sat_review_reason text,current_responsible_id uuid,commercial_review_status text,commercial_review_reason text,commercial_reviewed_at timestamptz,source text,entered_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.current_company_id(); v_supervisor boolean:=public.has_any_role(array['superadmin','SAT','Gerencia']);
begin
  if p_queue not in ('sat','commercial','billing') then raise exception 'cola: departamento no valido'; end if;
  if p_queue='sat' and not public.has_any_role(array['superadmin','SAT','Gerencia']) then raise exception 'permiso: no tienes acceso a la cola SAT'; end if;
  if p_queue='billing' and not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: no tienes acceso a la cola de Facturacion'; end if;
  if p_queue='commercial' and not (public.has_any_role(array['superadmin','SAT','Gerencia','Comercial'])) then raise exception 'permiso: no tienes acceso a la cola Comercial'; end if;
  return query
  select wo.id,wo.company_id,wo.code,wo.title,c.legal_name,s.name,
    string_agg(distinct e.code,', ' order by e.code),wo.description,
    q.code,wo.sat_reviewed_at,trim(coalesce(sp.first_name||' ','')||coalesce(sp.last_name,'')),wo.sat_review_flags,wo.sat_review_reason,
    wo.current_responsible_id,wo.commercial_review_status,wo.commercial_review_reason,wo.commercial_reviewed_at,
    case when p_queue='sat' and wo.sat_review_status='approved' then 'Corrección económica' when wo.sat_review_destination='comercial' then 'Desde Comercial' else 'Desde SAT' end,
    case when wo.sat_review_destination='comercial' then wo.commercial_reviewed_at else wo.sat_reviewed_at end
  from public.work_orders wo
  left join public.clients c on c.id=wo.client_id
  left join public.sites s on s.id=wo.site_id
  left join public.quotes q on q.id=wo.quote_id
  left join public.profiles sp on sp.id=wo.sat_reviewed_by
  left join public.work_order_equipment we on we.work_order_id=wo.id
  left join public.equipment e on e.id=we.equipment_id
  where wo.company_id=v_company and wo.deleted_at is null and wo.status not in ('Cerrado','Cancelado')
    and (not exists (select 1 from public.invoice_work_orders iw where iw.work_order_id=wo.id and iw.deleted_at is null))
    and ((p_queue='sat' and wo.status in ('Finalizado tecnicamente','Devuelto por SAT') and (wo.sat_review_status in ('pending','returned') or (wo.sat_review_status='approved' and wo.sat_review_destination='facturacion' and (wo.economic_review_status is distinct from 'approved' or (coalesce(wo.billable,true) and not coalesce(wo.warranty,false) and coalesce(wo.sale_amount,0)<=0)))))
      or (p_queue='commercial' and wo.sat_review_destination='comercial' and wo.commercial_review_status='pending' and (v_supervisor or wo.current_responsible_id=public.current_profile_id()))
      or (p_queue='billing' and wo.sat_review_status='approved' and (wo.economic_review_status is distinct from 'approved' or (coalesce(wo.billable,true) and coalesce(wo.sale_amount,0)>0)) and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved'))))
  group by wo.id,c.legal_name,s.name,q.code,sp.first_name,sp.last_name;
end $$;



-- DoorManager Pro - habilita a Oficina para completar/revisar partes operativos.
-- No relaja RLS global: mantiene company_id, usuario activo y asignacion tecnica.


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

-- Office must see every concept that the economic approval RPC requires.
-- Only SELECT, in the active company; direct writes remain unchanged.

drop policy if exists work_order_time_entries_office_economic_select on public.work_order_time_entries;
create policy work_order_time_entries_office_economic_select on public.work_order_time_entries
for select to authenticated using (
  company_id=public.current_company_id() and public.has_any_role(array['Oficina'])
  and exists(select 1 from public.work_orders review_work where review_work.id=work_order_time_entries.work_order_id and review_work.company_id=work_order_time_entries.company_id and review_work.deleted_at is null)
);
drop policy if exists work_order_materials_office_economic_select on public.work_order_materials;
create policy work_order_materials_office_economic_select on public.work_order_materials
for select to authenticated using (
  company_id=public.current_company_id() and public.has_any_role(array['Oficina'])
  and exists(select 1 from public.work_orders review_work where review_work.id=work_order_materials.work_order_id and review_work.company_id=work_order_materials.company_id and review_work.deleted_at is null)
);
drop policy if exists work_order_cost_entries_office_economic_select on public.work_order_cost_entries;
create policy work_order_cost_entries_office_economic_select on public.work_order_cost_entries
for select to authenticated using (
  company_id=public.current_company_id() and public.has_any_role(array['Oficina'])
  and exists(select 1 from public.work_orders review_work where review_work.id=work_order_cost_entries.work_order_id and review_work.company_id=work_order_cost_entries.company_id and review_work.deleted_at is null)
);

commit;
