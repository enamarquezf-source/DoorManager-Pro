-- Atomic work intake: existing equipment, provisional new equipment, or no equipment.
begin;
alter table public.work_orders drop constraint if exists work_orders_type_check;
alter table public.work_orders add constraint work_orders_type_check check(type in('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia','Mejora'));
create table if not exists public.work_intake_receipts(
 operation_id uuid primary key,company_id uuid not null references public.companies(id),actor_id uuid not null references public.profiles(id),payload jsonb not null,work_order_id uuid not null references public.work_orders(id),created_at timestamptz not null default now()
);
alter table public.work_intake_receipts enable row level security;
revoke all on public.work_intake_receipts from public,anon,authenticated;

create or replace function public.dmp_resolve_equipment_selection(p_company uuid,p_client uuid,p_site uuid,p_selection jsonb)
returns uuid[] language plpgsql security definer set search_path=public as $$
declare item jsonb; draft jsonb; equipment_id uuid; type_id uuid; result uuid[]:='{}'; actor public.profiles;
begin
 actor:=public.dmp_active_profile();
 if actor.company_id<>p_company or not exists(select 1 from public.sites s where s.id=p_site and s.company_id=p_company and s.client_id=p_client and s.deleted_at is null) then raise exception 'El centro no pertenece al cliente y empresa'; end if;
 if jsonb_typeof(p_selection) is distinct from 'array' or jsonb_array_length(p_selection)>2000 then raise exception 'Selección de equipos no válida'; end if;
 for item in select value from jsonb_array_elements(p_selection) loop
  equipment_id:=nullif(item->>'existing_equipment_id','')::uuid;
  if equipment_id is null then
   draft:=item->'new';
   if jsonb_typeof(draft) is distinct from 'object' then raise exception 'Equipo nuevo no válido'; end if;
   type_id:=nullif(draft->>'equipment_type_id','')::uuid;
   if type_id is null then
    perform pg_advisory_xact_lock(hashtextextended('dmp:pending-equipment:'||p_company::text,0));
    select id into type_id from public.equipment_types where company_id=p_company and name='Equipo por identificar' limit 1;
    if type_id is null then insert into public.equipment_types(company_id,name,description,active) values(p_company,'Equipo por identificar','Inventario provisional: completar durante la visita',true) returning id into type_id;
    else update public.equipment_types set active=true where id=type_id; end if;
   end if;
   if not exists(select 1 from public.equipment_types where id=type_id and active and (company_id=p_company or company_id is null)) then raise exception 'Tipo de equipo fuera de la empresa'; end if;
   insert into public.equipment(company_id,code,client_id,site_id,equipment_type_id,brand,model,serial_number,internal_location,installation_date,status,notes)
   values(p_company,public.next_dmp_code(p_company,'equipment',public.dmp_equipment_code_prefix(type_id),false,6),p_client,p_site,type_id,nullif(draft->>'brand',''),nullif(draft->>'model',''),nullif(draft->>'serial_number',''),nullif(draft->>'internal_location',''),nullif(draft->>'installation_date','')::date,'Pendiente de revision',nullif(draft->>'notes','')) returning id into equipment_id;
  end if;
  if not exists(select 1 from public.equipment where id=equipment_id and company_id=p_company and client_id=p_client and site_id=p_site and deleted_at is null) then raise exception 'El equipo no pertenece a este cliente y centro'; end if;
  if not equipment_id=any(result) then result:=array_append(result,equipment_id); end if;
 end loop;
 return result;
end;
$$;
revoke all on function public.dmp_resolve_equipment_selection(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

do $$ begin
 if to_regprocedure('public.dmp_work_intake_legacy_create(jsonb)') is null then alter function public.create_work_order_full(jsonb) rename to dmp_work_intake_legacy_create; end if;
end $$;
revoke all on function public.dmp_work_intake_legacy_create(jsonb) from public,anon,authenticated;
create or replace function public.create_work_order_full(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; operation uuid:=coalesce(nullif(p_payload->>'client_operation_id','')::uuid,gen_random_uuid()); request jsonb; receipt public.work_intake_receipts; selection jsonb; ids uuid[]; work_id uuid;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) then raise exception 'No tienes permiso para crear partes'; end if;
 if nullif(p_payload->>'company_id','')::uuid is distinct from actor.company_id or nullif(p_payload->>'created_by','')::uuid is distinct from actor.id then raise exception 'Empresa o creador no válidos'; end if;
 request:=(p_payload-'client_operation_id')||jsonb_build_object('_operation','create');
 perform pg_advisory_xact_lock(hashtextextended('dmp:intake:'||operation::text,0));
 select * into receipt from public.work_intake_receipts where operation_id=operation;
 if found then
  if receipt.company_id<>actor.company_id or receipt.actor_id<>actor.id or receipt.payload<>request then raise exception 'La operación ya existe con otros datos'; end if;
  return receipt.work_order_id;
 end if;
 selection:=case when p_payload->>'equipment_mode'='unknown' then '[]'::jsonb else coalesce(p_payload->'equipment_selection','[]'::jsonb) end;
 if p_payload->>'equipment_mode' is distinct from 'unknown' and nullif(p_payload->>'main_equipment_id','') is not null and jsonb_array_length(selection)=0 then selection:=jsonb_build_array(jsonb_build_object('existing_equipment_id',p_payload->>'main_equipment_id')); end if;
 ids:=public.dmp_resolve_equipment_selection(actor.company_id,(p_payload->>'client_id')::uuid,(p_payload->>'site_id')::uuid,selection);
 select coalesce(jsonb_agg(jsonb_build_object('existing_equipment_id',id)),'[]'::jsonb) into selection from unnest(ids) id;
 work_id:=public.dmp_work_intake_legacy_create(p_payload||jsonb_build_object('equipment_selection',selection,'main_equipment_id',null));
 update public.work_orders set observations=nullif(p_payload->>'observations','') where id=work_id;
 insert into public.work_intake_receipts(operation_id,company_id,actor_id,payload,work_order_id) values(operation,actor.company_id,actor.id,request,work_id);
 return work_id;
end;
$$;
create or replace function public.dmp_create_work_order_full(p_payload jsonb) returns uuid language sql security definer set search_path=public as $$ select public.create_work_order_full(p_payload); $$;
revoke all on function public.create_work_order_full(jsonb) from public,anon;
revoke all on function public.dmp_create_work_order_full(jsonb) from public,anon;
grant execute on function public.create_work_order_full(jsonb),public.dmp_create_work_order_full(jsonb) to authenticated;

create or replace function public.dmp_attach_work_equipment(p_work_id uuid,p_operation_id uuid,p_selection jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; work public.work_orders; ids uuid[]; v_equipment_id uuid; receipt public.work_intake_receipts; request jsonb; first_equipment boolean;
begin
 actor:=public.dmp_active_profile();
 select * into work from public.work_orders where id=p_work_id and company_id=actor.company_id and deleted_at is null for update;
 if not found or work.status in ('Cerrado','Cancelado') then raise exception 'El parte no está disponible para asociar equipos'; end if;
 if not coalesce((public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or (public.has_any_role(array['Tecnico']) and (work.main_technician_id=actor.id or public.is_assigned_to_work_order(work.id,actor.id)))),false) then raise exception 'No tienes permiso para asociar equipos a este parte'; end if;
 if p_operation_id is null then raise exception 'Falta identificar la operación'; end if;
 request:=jsonb_build_object('_operation','attach','work_order_id',work.id,'selection',p_selection);
 perform pg_advisory_xact_lock(hashtextextended('dmp:intake:'||p_operation_id::text,0));
 select * into receipt from public.work_intake_receipts where operation_id=p_operation_id;
 if found then
  if receipt.company_id<>actor.company_id or receipt.actor_id<>actor.id or receipt.payload<>request then raise exception 'La operación ya existe con otros datos'; end if;
  return receipt.work_order_id;
 end if;
 ids:=public.dmp_resolve_equipment_selection(actor.company_id,work.client_id,work.site_id,p_selection);
 first_equipment:=work.main_equipment_id is null;
 foreach v_equipment_id in array ids loop
  insert into public.work_order_equipment(company_id,work_order_id,equipment_id,is_primary) values(actor.company_id,work.id,v_equipment_id,first_equipment) on conflict(work_order_id,equipment_id) do nothing;
  if first_equipment then update public.work_orders set main_equipment_id=v_equipment_id where id=work.id;first_equipment:=false;end if;
 end loop;
 insert into public.work_intake_receipts(operation_id,company_id,actor_id,payload,work_order_id) values(p_operation_id,actor.company_id,actor.id,request,work.id);
 return work.id;
end;
$$;
revoke all on function public.dmp_attach_work_equipment(uuid,uuid,jsonb) from public,anon;
grant execute on function public.dmp_attach_work_equipment(uuid,uuid,jsonb) to authenticated;
create or replace function public.dmp_update_work_intake(p_work_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; work public.work_orders; client uuid:=(p_payload->>'client_id')::uuid; site uuid:=(p_payload->>'site_id')::uuid; target_case_id uuid:=nullif(p_payload->>'case_id','')::uuid;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'No tienes permiso para modificar el parte'; end if;
 select * into work from public.work_orders where id=p_work_id and company_id=actor.company_id and deleted_at is null for update;
 if not found then raise exception 'Parte fuera de la empresa'; end if;
 if not exists(select 1 from public.sites s where s.id=site and s.client_id=client and s.company_id=actor.company_id and s.deleted_at is null) then raise exception 'Cliente y centro no válidos'; end if;
 if (work.client_id<>client or work.site_id<>site) and exists(select 1 from public.work_order_equipment where work_order_id=work.id) then raise exception 'El parte ya tiene equipos asociados: conserva su cliente y centro'; end if;
 if target_case_id is not null and not exists(select 1 from public.cases c where c.id=target_case_id and c.company_id=actor.company_id and c.client_id=client and (c.site_id is null or c.site_id=site) and c.deleted_at is null) then raise exception 'Expediente fuera del cliente y centro'; end if;
 update public.work_orders set client_id=client,site_id=site,case_id=target_case_id,title=coalesce(nullif(trim(p_payload->>'title'),''),title),type=coalesce(p_payload->>'type',type),priority=coalesce(p_payload->>'priority',priority),description=p_payload->>'description',observations=p_payload->>'observations',scheduled_date=nullif(p_payload->>'scheduled_date','')::date,scheduled_time=nullif(p_payload->>'scheduled_time','')::time,estimated_duration_minutes=nullif(p_payload->>'estimated_duration_minutes','')::integer,planned_material=p_payload->>'planned_material',updated_by=actor.id,updated_at=now() where id=work.id;
 if p_payload->>'equipment_mode' is distinct from 'unknown' and jsonb_array_length(coalesce(p_payload->'equipment_selection','[]'::jsonb))>0 then
  perform public.dmp_attach_work_equipment(work.id,(p_payload->>'client_operation_id')::uuid,p_payload->'equipment_selection');
 end if;
 return work.id;
end;
$$;
revoke all on function public.dmp_update_work_intake(uuid,jsonb) from public,anon;
grant execute on function public.dmp_update_work_intake(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
