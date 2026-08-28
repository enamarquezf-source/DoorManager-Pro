-- DoorManager Pro - fix the 089 departmental queue runtime query.
-- The equipment table has code, not name. Business rules and return shape remain unchanged.

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
    case when wo.sat_review_destination='comercial' then 'Desde Comercial' else 'Desde SAT' end,
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
    and ((p_queue='sat' and wo.sat_review_status='pending')
      or (p_queue='commercial' and wo.sat_review_destination='comercial' and wo.commercial_review_status='pending' and (v_supervisor or wo.current_responsible_id=public.current_profile_id()))
      or (p_queue='billing' and wo.sat_review_status='approved' and ((wo.sat_review_destination='facturacion' and wo.commercial_review_status='not_started') or (wo.sat_review_destination='comercial' and wo.commercial_review_status='approved'))))
  group by wo.id,c.legal_name,s.name,q.code,sp.first_name,sp.last_name;
end $$;

revoke all on function public.dmp_department_routing_queue(text) from public;
revoke all on function public.dmp_department_routing_queue(text) from anon;
grant execute on function public.dmp_department_routing_queue(text) to authenticated;

notify pgrst, 'reload schema';
commit;
