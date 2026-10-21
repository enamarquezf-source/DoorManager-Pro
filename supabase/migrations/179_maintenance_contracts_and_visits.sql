-- Contracts are scoped to one client/centre. Visits are plans; work orders are generated explicitly and once.
begin;
create table if not exists public.maintenance_contracts(
 id uuid primary key,company_id uuid not null references public.companies(id),client_id uuid not null references public.clients(id),site_id uuid not null references public.sites(id),
 code text not null,title text not null,status text not null default 'draft' check(status in('draft','active','paused','completed','cancelled')),
 starts_on date not null,ends_on date not null,definition jsonb not null,request_payload jsonb not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 check(ends_on>=starts_on and ends_on-starts_on<=3660),unique(company_id,code)
);
create table if not exists public.maintenance_contract_equipment(
 contract_id uuid not null references public.maintenance_contracts(id),company_id uuid not null references public.companies(id),equipment_id uuid not null references public.equipment(id),primary key(contract_id,equipment_id)
);
create table if not exists public.maintenance_visits(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),contract_id uuid not null references public.maintenance_contracts(id),due_on date not null,
 status text not null default 'planned' check(status in('planned','skipped')),work_order_id uuid references public.work_orders(id),created_at timestamptz not null default now(),unique(contract_id,due_on),unique(work_order_id)
);
create index if not exists maintenance_contracts_company_idx on public.maintenance_contracts(company_id,starts_on);
create index if not exists maintenance_visits_company_due_idx on public.maintenance_visits(company_id,due_on);
create table if not exists public.maintenance_operation_receipts(operation_id uuid primary key,company_id uuid not null references public.companies(id),actor_id uuid not null references public.profiles(id),contract_id uuid not null references public.maintenance_contracts(id),payload jsonb not null);
alter table public.maintenance_operation_receipts enable row level security;
revoke all on public.maintenance_operation_receipts from public,anon,authenticated;
alter table public.maintenance_contracts enable row level security;
alter table public.maintenance_contract_equipment enable row level security;
alter table public.maintenance_visits enable row level security;
revoke all on public.maintenance_contracts,public.maintenance_contract_equipment,public.maintenance_visits from public,anon,authenticated;
grant select on public.maintenance_contracts,public.maintenance_contract_equipment,public.maintenance_visits to authenticated;
drop policy if exists maintenance_contracts_read on public.maintenance_contracts;
create policy maintenance_contracts_read on public.maintenance_contracts for select to authenticated using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
drop policy if exists maintenance_equipment_read on public.maintenance_contract_equipment;
create policy maintenance_equipment_read on public.maintenance_contract_equipment for select to authenticated using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));
drop policy if exists maintenance_visits_read on public.maintenance_visits;
create policy maintenance_visits_read on public.maintenance_visits for select to authenticated using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']));

create or replace function public.dmp_save_maintenance_contract(p_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; client uuid:=(p_payload->>'client_id')::uuid; site uuid:=(p_payload->>'site_id')::uuid; starts date:=(p_payload->>'starts_on')::date; ends date:=(p_payload->>'ends_on')::date; first_date date:=nullif(p_payload->>'first_visit','')::date; months integer:=(p_payload->>'recurrence_months')::integer; ids uuid[]; equipment_id uuid; date_value date; index integer:=0; visit_count integer:=0; previous public.maintenance_contracts; technician uuid:=nullif(p_payload->>'technician_id','')::uuid;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']) then raise exception 'No tienes permiso para crear contratos'; end if;
 if p_id is null or jsonb_typeof(p_payload) is distinct from 'object' or nullif(trim(p_payload->>'title'),'') is null or starts is null or ends is null or ends<starts or ends-starts>3660 or months is null or months not in(0,1,2,3,4,6,12) then raise exception 'Revisa título, vigencia y frecuencia del contrato'; end if;
 if not exists(select 1 from public.sites s join public.clients c on c.id=s.client_id and c.company_id=s.company_id where s.id=site and s.client_id=client and s.company_id=actor.company_id and s.deleted_at is null and c.deleted_at is null) then raise exception 'El centro no pertenece al cliente y empresa'; end if;
 if coalesce(p_payload->>'status','draft') not in('draft','active') then raise exception 'Estado inicial de contrato no válido'; end if;
 if coalesce(p_payload->>'billing_frequency','') not in('monthly','quarterly','annual','per_visit','single') or jsonb_typeof(p_payload->'billing_amount') is distinct from 'number' or (p_payload->>'billing_amount')::numeric<0 then raise exception 'Define el importe y periodicidad de facturación'; end if;
 if technician is not null and not exists(select 1 from public.profiles p join public.profile_roles pr on pr.profile_id=p.id join public.roles r on r.id=pr.role_id where p.id=technician and p.company_id=actor.company_id and p.active and p.deleted_at is null and r.name='Tecnico') then raise exception 'Técnico no válido para la empresa'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dmp:contract:'||p_id::text,0));
 select * into previous from public.maintenance_contracts where id=p_id;
 if found then
  if previous.company_id<>actor.company_id or previous.created_by<>actor.id or previous.request_payload<>p_payload then raise exception 'La operación ya existe con otros datos'; end if;
  return previous.id;
 end if;
 ids:=public.dmp_resolve_equipment_selection(actor.company_id,client,site,case when p_payload->>'equipment_mode'='unknown' then '[]'::jsonb else coalesce(p_payload->'equipment_selection','[]'::jsonb) end);
 insert into public.maintenance_contracts(id,company_id,client_id,site_id,code,title,status,starts_on,ends_on,definition,request_payload,created_by)
 values(p_id,actor.company_id,client,site,public.next_dmp_code(actor.company_id,'maintenance_contracts','MNT',false,6),trim(p_payload->>'title'),coalesce(p_payload->>'status','draft'),starts,ends,p_payload- 'equipment_selection',p_payload,actor.id);
 foreach equipment_id in array ids loop insert into public.maintenance_contract_equipment(contract_id,company_id,equipment_id) values(p_id,actor.company_id,equipment_id);end loop;
 if months=0 then
  if jsonb_typeof(p_payload->'custom_dates') is distinct from 'array' then raise exception 'Indica las fechas de visita'; end if;
  for date_value in select distinct value::date from jsonb_array_elements_text(p_payload->'custom_dates') loop
   if date_value<starts or date_value>ends then raise exception 'Hay visitas fuera de la vigencia del contrato'; end if;
   insert into public.maintenance_visits(company_id,contract_id,due_on) values(actor.company_id,p_id,date_value);visit_count:=visit_count+1;
  end loop;
 else
  if first_date is null or first_date<starts or first_date>ends then raise exception 'La primera visita debe estar dentro del contrato'; end if;
  loop
   date_value:=(first_date+make_interval(months=>index*months))::date;exit when date_value>ends;
   insert into public.maintenance_visits(company_id,contract_id,due_on) values(actor.company_id,p_id,date_value);visit_count:=visit_count+1;index:=index+1;
   if index>120 then raise exception 'El plan supera 120 visitas'; end if;
  end loop;
 end if;
 if visit_count<1 or visit_count>120 then raise exception 'El plan debe contener entre 1 y 120 visitas'; end if;
 return p_id;
end;
$$;

create or replace function public.dmp_generate_maintenance_visit(p_visit uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; visit public.maintenance_visits; contract public.maintenance_contracts; selection jsonb; work_id uuid;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) then raise exception 'No tienes permiso para generar partes'; end if;
 select c.* into contract from public.maintenance_contracts c join public.maintenance_visits v on v.contract_id=c.id where v.id=p_visit and c.company_id=actor.company_id for update of c;
 if not found then raise exception 'Visita fuera de la empresa'; end if;
 select * into visit from public.maintenance_visits where id=p_visit and company_id=actor.company_id for update;
 if visit.work_order_id is not null then return visit.work_order_id; end if;
 if contract.status<>'active' or visit.status<>'planned' then raise exception 'Activa el contrato y la visita antes de generar el parte'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('existing_equipment_id',equipment_id)),'[]'::jsonb) into selection from public.maintenance_contract_equipment where contract_id=contract.id and company_id=actor.company_id;
 work_id:=public.create_work_order_full(jsonb_build_object('client_operation_id',visit.id,'company_id',actor.company_id,'created_by',actor.id,'created_role',case when actor.primary_area='superadmin' then 'SAT' else actor.primary_area end,'client_id',contract.client_id,'site_id',contract.site_id,'type','Mantenimiento','origin','Sistema','title',contract.code||' · '||contract.title||' · '||to_char(visit.due_on,'DD/MM/YYYY'),'description',concat_ws(E'\n',nullif(contract.definition->>'coverage',''),case when jsonb_array_length(selection)=0 then 'Inventario pendiente: identificar los equipos durante la visita.' end,nullif(contract.definition->>'exclusions','')),'scheduled_date',visit.due_on,'technician_id',nullif(contract.definition->>'technician_id',''),'equipment_selection',selection));
 update public.maintenance_visits set work_order_id=work_id where id=visit.id;
 return work_id;
end;
$$;
create or replace function public.dmp_generate_maintenance_plan(p_contract uuid) returns integer language plpgsql security definer set search_path=public as $$
declare actor public.profiles; visit_id uuid; count integer:=0;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or not exists(select 1 from public.maintenance_contracts where id=p_contract and company_id=actor.company_id and status='active') then raise exception 'Contrato no disponible para generar partes';end if;
 for visit_id in select id from public.maintenance_visits where contract_id=p_contract and company_id=actor.company_id and status='planned' and work_order_id is null order by due_on,id loop perform public.dmp_generate_maintenance_visit(visit_id);count:=count+1;end loop;
 return count;
end;
$$;
create or replace function public.dmp_change_maintenance_contract(p_id uuid,p_status text) returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or p_status is null or p_status not in('draft','active','paused','completed','cancelled') then raise exception 'Estado o permiso no válido';end if;
 update public.maintenance_contracts set status=p_status where id=p_id and company_id=actor.company_id;
 if not found then raise exception 'Contrato fuera de la empresa';end if;return p_id;
end;
$$;
create or replace function public.dmp_change_maintenance_visit(p_id uuid,p_date date,p_status text) returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; contract public.maintenance_contracts; visit public.maintenance_visits;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) or p_status is null or p_status not in('planned','skipped') then raise exception 'Estado o permiso no válido';end if;
 select c.* into contract from public.maintenance_contracts c join public.maintenance_visits v on v.contract_id=c.id where v.id=p_id and c.company_id=actor.company_id for update of c;
 if not found then raise exception 'Visita fuera de la empresa';end if;
 select * into visit from public.maintenance_visits where id=p_id and company_id=actor.company_id for update;
 if visit.work_order_id is not null then raise exception 'La visita tiene un parte: gestiona su agenda desde el parte';end if;
 if p_date is null or p_date<contract.starts_on or p_date>contract.ends_on then raise exception 'Fecha fuera de la vigencia';end if;
 update public.maintenance_visits set due_on=p_date,status=p_status where id=p_id;
 return p_id;
end;
$$;
create or replace function public.dmp_set_maintenance_equipment(p_id uuid,p_operation_id uuid,p_selection jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; contract public.maintenance_contracts; ids uuid[]; equipment_id uuid; receipt public.maintenance_operation_receipts;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial']) then raise exception 'No tienes permiso para modificar cobertura';end if;
 select * into contract from public.maintenance_contracts where id=p_id and company_id=actor.company_id for update;
 if not found or contract.status not in('draft','active','paused') then raise exception 'Contrato no editable';end if;
 if p_operation_id is null then raise exception 'Falta identificar la operación';end if;
 perform pg_advisory_xact_lock(hashtextextended('dmp:coverage:'||p_operation_id::text,0));
 select * into receipt from public.maintenance_operation_receipts where operation_id=p_operation_id;
 if found then
  if receipt.company_id<>actor.company_id or receipt.actor_id<>actor.id or receipt.contract_id<>p_id or receipt.payload<>p_selection then raise exception 'La operación ya existe con otros datos';end if;
  return p_id;
 end if;
 ids:=public.dmp_resolve_equipment_selection(actor.company_id,contract.client_id,contract.site_id,p_selection);
 delete from public.maintenance_contract_equipment where contract_id=p_id and company_id=actor.company_id;
 foreach equipment_id in array ids loop insert into public.maintenance_contract_equipment(contract_id,company_id,equipment_id) values(p_id,actor.company_id,equipment_id);end loop;
 insert into public.maintenance_operation_receipts(operation_id,company_id,actor_id,contract_id,payload) values(p_operation_id,actor.company_id,actor.id,p_id,p_selection);
 return p_id;
end;
$$;
revoke all on function public.dmp_save_maintenance_contract(uuid,jsonb),public.dmp_generate_maintenance_visit(uuid),public.dmp_generate_maintenance_plan(uuid),public.dmp_change_maintenance_contract(uuid,text),public.dmp_change_maintenance_visit(uuid,date,text),public.dmp_set_maintenance_equipment(uuid,uuid,jsonb) from public,anon;
grant execute on function public.dmp_save_maintenance_contract(uuid,jsonb),public.dmp_generate_maintenance_visit(uuid),public.dmp_generate_maintenance_plan(uuid),public.dmp_change_maintenance_contract(uuid,text),public.dmp_change_maintenance_visit(uuid,date,text),public.dmp_set_maintenance_equipment(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
