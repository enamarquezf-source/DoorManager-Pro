-- Dedicated demo only. Install after 004. No production migrations or records.
begin;
do $$ begin
 if to_regclass('public.dmp_demo_sessions') is null then raise exception 'Demo: instala primero 002 y 004'; end if;
end $$;

-- Include the business-client permission repair for existing demo installations.
drop policy if exists clients_insert_business on public.clients;
create policy clients_insert_business on public.clients for insert to authenticated
with check(company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']));
drop policy if exists clients_update_business on public.clients;
create policy clients_update_business on public.clients for update to authenticated
using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']))
with check(company_id=public.current_company_id());

create table if not exists public.dmp_demo_role_profiles (
 company_id uuid not null references public.companies(id) deferrable initially immediate,
 role_name text not null check(role_name in ('SAT','Tecnico','Oficina','Gerencia','Comercial')),
 profile_id uuid not null references public.profiles(id) deferrable initially immediate, primary key(company_id,role_name), unique(profile_id)
);
create table if not exists public.dmp_demo_scenarios (
 company_id uuid not null references public.companies(id) deferrable initially immediate, scenario text not null,
 primary key(company_id,scenario)
);
alter table public.dmp_demo_role_profiles enable row level security;
alter table public.dmp_demo_scenarios enable row level security;
revoke all on public.dmp_demo_role_profiles,public.dmp_demo_scenarios from public,anon,authenticated;
grant all on public.dmp_demo_role_profiles,public.dmp_demo_scenarios to service_role;

create or replace function public.dmp_demo_prepare_catalog(c uuid) returns void language plpgsql security definer set search_path=public as $$
declare equipment_type uuid; template uuid; section uuid; shape jsonb; section_data jsonb; label text; position integer; item_position integer;
begin
 for shape in select value from jsonb_array_elements('[
   {"type":"Puerta seccional","sections":[{"title":"Hoja y guiado","items":["Paneles","Bisagras","Rodillos y guías"]},{"title":"Accionamiento","items":["Motor","Muelles y cables","Cuadro de maniobras"]},{"title":"Seguridad","items":["Fotocélulas","Banda de seguridad","Desbloqueo manual"]}]},
   {"type":"Puerta corredera","sections":[{"title":"Estructura","items":["Hoja","Carril y ruedas","Topes"]},{"title":"Accionamiento","items":["Motor","Cremallera","Finales de carrera"]},{"title":"Seguridad","items":["Fotocélulas","Banda de seguridad","Desbloqueo manual"]}]},
   {"type":"Barrera automática","sections":[{"title":"Armario","items":["Carcasa y anclajes","Motor","Cuadro de maniobras"]},{"title":"Asta","items":["Asta y fijaciones","Sistema de contrapeso"]},{"title":"Seguridad","items":["Fotocélulas","Detección de obstáculos","Desbloqueo manual"]}]}
 ]'::jsonb) loop
   select id into equipment_type from public.equipment_types where company_id=c and name=shape->>'type' and active limit 1;
   if equipment_type is null then insert into public.equipment_types(company_id,name,description) values(c,shape->>'type','Tipo ficticio para demostración') returning id into equipment_type; end if;
   select id into template from public.check_templates where company_id=c and equipment_type_id=equipment_type and name='Revisión de prueba · '||(shape->>'type') and active limit 1;
   if template is null then
   insert into public.check_templates(company_id,equipment_type_id,name,version) values(c,equipment_type,'Revisión de prueba · '||(shape->>'type'),'DEMO-1') returning id into template;
   position:=0;
   for section_data in select value from jsonb_array_elements(shape->'sections') loop
     position:=position+1;
     insert into public.check_template_sections(template_id,title,position) values(template,section_data->>'title',position) returning id into section;
     item_position:=0;
     for label in select jsonb_array_elements_text(section_data->'items') loop
       item_position:=item_position+1;
       insert into public.check_template_items(section_id,title,component,position) values(section,'Comprobar estado y funcionamiento',label,item_position);
     end loop;
   end loop;
   end if;
 end loop;
end $$;
revoke all on function public.dmp_demo_prepare_catalog(uuid) from public,anon,authenticated;

create or replace function public.dmp_demo_seed_technician(c uuid,p uuid) returns void language plpgsql security definer set search_path=public as $$
declare client uuid; site uuid; work uuid; equipment uuid; equipment_type uuid; template uuid; section uuid;
 shape jsonb; section_data jsonb; label text; position integer; item_position integer;
begin
 perform public.dmp_demo_prepare_catalog(c);
 perform public.dmp_demo_prepare_labor(c);
 insert into public.clients(company_id,code,legal_name,notes) values(c,'CLI-DEMO','Cliente ficticio · Demo','Escenario ficticio, sin datos reales') returning id into client;
 insert into public.sites(company_id,client_id,code,name,address) values(c,client,'CEN-DEMO','Centro de prueba','Ubicación ficticia · no desplazarse') returning id into site;
 insert into public.work_orders(company_id,code,client_id,site_id,title,description,type,origin,created_by,created_role,main_technician_id,current_responsible_id,scheduled_date,billable)
 values(c,'PAR-DEMO',client,site,'Tu primera revisión · tres equipos','Prueba los checks de cada equipo. Puedes marcar componentes favorables o con defecto, explicar el problema y añadir fotos ficticias.','Mantenimiento','Gerencia',p,'Tecnico',p,p,(now() at time zone 'Europe/Madrid')::date,false) returning id into work;
 insert into public.work_order_assignments(company_id,work_order_id,technician_id,assignment_date,assigned_by)
 values(c,work,p,(now() at time zone 'Europe/Madrid')::date,p);
 for shape in select value from jsonb_array_elements('[{"type":"Puerta seccional"},{"type":"Puerta corredera"},{"type":"Barrera automática"}]'::jsonb) loop
   select id into equipment_type from public.equipment_types where company_id=c and name=shape->>'type' and active limit 1;
   insert into public.equipment(company_id,code,client_id,site_id,equipment_type_id,model,internal_location)
   values(c,'EQ-DEMO-'||substr(equipment_type::text,1,8),client,site,equipment_type,'Modelo ficticio',shape->>'type') returning id into equipment;
   insert into public.work_order_equipment(company_id,work_order_id,equipment_id,is_primary) values(c,work,equipment,false);
 end loop;
 if (select count(*) from public.checks where work_order_id=work)<>3 then raise exception 'Demo: no se han preparado los tres checks'; end if;
 update public.dmp_demo_sessions set work_order_id=work where company_id=c;
end $$;

create or replace function public.dmp_demo_prepare_team(c uuid) returns void language plpgsql security definer set search_path=public as $$
declare s public.dmp_demo_sessions; r text; p uuid;
begin
 select * into s from public.dmp_demo_sessions where company_id=c;
 if s.id is null then raise exception 'Demo: empresa no temporal'; end if;
 insert into public.dmp_demo_role_profiles values(c,s.role_name,s.profile_id) on conflict do nothing;
 foreach r in array array['SAT','Tecnico','Oficina','Gerencia','Comercial'] loop
  if not exists(select 1 from public.dmp_demo_role_profiles where company_id=c and role_name=r) then
   p:=gen_random_uuid();
   insert into public.profiles(id,company_id,first_name,last_name,email,primary_area)
   values(p,c,case r when 'Tecnico' then 'Alex' when 'SAT' then 'Sara' when 'Oficina' then 'Olivia' when 'Comercial' then 'Carlos' else 'Gema' end,'Demo',p::text||'@example.invalid',r);
   insert into public.profile_roles(profile_id,role_id) select p,id from public.roles where name=r;
   insert into public.dmp_demo_role_profiles values(c,r,p);
  end if;
 end loop;
 perform public.dmp_demo_prepare_labor(c);
 perform public.dmp_demo_prepare_catalog(c);
 insert into public.treasury_accounts(company_id,name,account_type,opening_balance,notes,created_by)
 values(c,'Caja de simulación','cash',0,'Sin conexión bancaria; cobros ficticios',s.profile_id) on conflict(company_id,name) do nothing;
end $$;

create or replace function public.dmp_demo_seed_business(c uuid,p_role text) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; tech uuid; main_tech uuid; second_tech uuid; third_tech uuid; cl uuid; st uuid; w uuid; rate uuid; version uuid; mat uuid; inv uuid; account uuid; employee uuid;
 n integer; month_number integer; day date; work_minutes integer; start_month date;
begin
 if p_role not in ('Oficina','Gerencia') then return; end if;
 if exists(select 1 from public.dmp_demo_scenarios where company_id=c and scenario=p_role) then return; end if;
 select profile_id into actor from public.dmp_demo_role_profiles where company_id=c and role_name='SAT';
 select profile_id into tech from public.dmp_demo_role_profiles where company_id=c and role_name='Tecnico';
 main_tech:=tech;
 if p_role='Gerencia' then
  second_tech:=gen_random_uuid();third_tech:=gen_random_uuid();
  insert into public.profiles(id,company_id,first_name,last_name,email,primary_area) values
   (second_tech,c,'Bea','Demo',second_tech::text||'@example.invalid','Tecnico'),(third_tech,c,'Leo','Demo',third_tech::text||'@example.invalid','Tecnico');
  insert into public.profile_roles(profile_id,role_id) select p.id,r.id from public.profiles p cross join public.roles r where p.id in(second_tech,third_tech) and r.name='Tecnico';
  foreach employee in array array[main_tech,second_tech,third_tech] loop
   for month_number in 0..2 loop
    start_month:=(date_trunc('month',current_date)-make_interval(months=>month_number))::date;
    insert into public.employee_hr_records(id,company_id,profile_id,kind,date_from,date_to,payload,created_by)
    values(gen_random_uuid(),c,employee,'payroll',start_month,(start_month+interval '1 month'-interval '1 day')::date,
    jsonb_build_object('mode','simulation','salary_base',1800,'supplements',200,'overtime_hours',0,'overtime_hourly_price',18,'employee_deductions',200,'employer_contributions',600,'other_employer_costs',0,'gross_amount',2000,'net_amount',1800,'employer_cost',2600,'statutory_calculation',false,'notes','Importes ficticios para estudios; no es una nómina oficial'),public.current_profile_id());
   end loop;
  end loop;
 end if;
 select id into rate from public.rate_catalog where company_id=c and code='tecnico';
 select id into version from public.rate_versions where company_id=c and rate_id=rate and active and deleted_at is null order by valid_from limit 1;
 insert into public.materials(company_id,code,description,cost,price,stock_controlled)
 values(c,'MAT-'||p_role,'Kit de mantenimiento ficticio · '||p_role,30,55,false) returning id into mat;
 for n in 1..case when p_role='Gerencia' then 12 else 1 end loop
  tech:=case when p_role='Gerencia' and n%3=1 then second_tech when p_role='Gerencia' and n%3=2 then third_tech else main_tech end;
  if n=1 or n=5 or n=9 then
   insert into public.clients(company_id,code,legal_name,status,notes)
   values(c,'CLI-'||p_role||'-'||n,'Cliente ejemplo '||p_role||' '||n,'Activo','Datos ficticios para la demostración') returning id into cl;
   insert into public.sites(company_id,client_id,code,name,address)
   values(c,cl,'CEN-'||p_role||'-'||n,'Centro industrial de ejemplo','Dirección ficticia · no desplazarse') returning id into st;
  end if;
  day:=current_date-((n-1)*7);
  work_minutes:=case when n%3=0 then 600 when n%2=0 then 240 else 120 end;
  insert into public.work_orders(company_id,code,client_id,site_id,title,description,type,origin,created_by,created_role,main_technician_id,current_responsible_id,scheduled_date,status,work_performed,finished_at,billable)
  values(c,'PAR-'||p_role||'-'||n,cl,st,case when p_role='Oficina' then 'Trabajo revisado · listo para facturar' else case n%3 when 0 then 'Reparación con desviación de costes' when 1 then 'Mantenimiento preventivo rentable' else 'Instalación y puesta en marcha' end end,
  'Escenario ficticio. Coste de mano de obra 22 €/h y venta 45 €/h; materiales y recursos registrados en el parte.',case n%3 when 0 then 'Correctivo' when 1 then 'Mantenimiento' else 'Instalacion' end,'SAT',actor,'SAT',tech,actor,day,'En intervencion','Revisión y ajuste de prueba; funcionamiento verificado.',day::timestamptz,true) returning id into w;
  insert into public.work_order_assignments(company_id,work_order_id,technician_id,assignment_date,assigned_by) values(c,w,tech,day,actor);
  insert into public.work_order_time_entries(company_id,work_order_id,profile_id,work_date,duration_minutes,manual_duration,description,created_by,hourly_cost,hourly_price,rate_id,rate_version_id,billing_mode,source,contributes_to_sale)
  values(c,w,tech,day,work_minutes,true,'Horas ficticias registradas por el técnico',tech,22,45,rate,version,'hour','additional',true);
  insert into public.work_order_materials(company_id,work_order_id,material_id,description,used_quantity,unit_cost,unit_price,registered_by,used_at,source,contributes_to_sale)
  values(c,w,mat,'Kit ficticio usado en la intervención',1,30,55,tech,day,'additional',true);
  if n%3=0 then
   insert into public.work_order_cost_entries(company_id,work_order_id,cost_type,description,quantity,unit_cost,unit_price,incurred_at,registered_by,source,contributes_to_sale)
   values(c,w,'coste_externo','Reparación externa no repercutida · ejemplo de desviación',1,700,0,day,actor,'manual',false);
  end if;
  update public.work_orders set (sale_amount,estimated_sale_amount,additional_sale_amount,real_cost_amount,margin_amount,estimated_margin_amount)=
   (select e.sale_amount,e.sale_amount,e.additional_sale_amount,e.real_cost_amount,e.margin_amount,e.margin_amount from public.v_work_order_economic_summary e where e.id=w) where id=w;
  update public.work_orders set status='Finalizado tecnicamente',economic_review_status='approved',office_validation_status='validated',sat_review_status='approved',sat_review_destination='facturacion',sat_reviewed_by=actor,sat_reviewed_at=now(),economic_reviewed_by=actor,economic_reviewed_at=now(),economic_review_reason='Simulación revisada para aprender facturación',economic_status='pendiente_facturar' where id=w;
  if p_role='Gerencia' and n<=3 then
   inv:=public.dmp_prepare_invoice_from_work_order(w,current_date+case when n=3 then 15 else -15 end,'SIMULACIÓN · datos ficticios',21);
   perform public.dmp_issue_invoice(inv,false,null);
   if n=1 then
    select id into account from public.treasury_accounts where company_id=c and name='Caja de simulación';
    perform public.dmp_record_invoice_payment(inv,175.45,current_date,'efectivo','DEMO','Cobro ficticio de ejemplo',account);
   end if;
  end if;
 end loop;
 insert into public.dmp_demo_scenarios values(c,p_role);
end $$;

create or replace function public.dmp_demo_prepare_journey(p_role text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.dmp_demo_sessions; target uuid; work uuid;
begin
 if p_role not in ('SAT','Tecnico','Oficina','Gerencia','Comercial') or p_role is null then raise exception 'Demo: rol no válido'; end if;
 select * into s from public.dmp_demo_sessions where auth_user_id=auth.uid() for update;
 if s.id is null or s.ended_at is not null or least(s.expires_at,s.absolute_expires_at)<=now() then raise exception 'Demo: sesión caducada'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and is_anonymous) then raise exception 'Demo: identidad no válida'; end if;
 perform public.dmp_demo_prepare_team(s.company_id);
 select profile_id into target from public.dmp_demo_role_profiles where company_id=s.company_id and role_name=p_role;
 -- Exactly one role and one Auth-linked profile are active at a time.
 update public.profiles set auth_user_id=null where id=s.profile_id and auth_user_id=auth.uid();
 update public.dmp_demo_sessions set profile_id=target,role_name=p_role where id=s.id;
 update public.profiles set auth_user_id=auth.uid() where id=target and company_id=s.company_id;
 if p_role='Tecnico' then
  select wo.id into work from public.work_orders wo where wo.company_id=s.company_id and wo.deleted_at is null and wo.status not in ('Finalizado tecnicamente','Finalizado','Facturado','Cancelado')
   and (wo.main_technician_id=target or exists(select 1 from public.work_order_assignments a where a.work_order_id=wo.id and a.technician_id=target and a.deleted_at is null)) order by wo.created_at desc limit 1;
  if work is null and not exists(select 1 from public.dmp_demo_scenarios where company_id=s.company_id and scenario='technical') then
   if not exists(select 1 from public.work_orders where company_id=s.company_id and code='PAR-DEMO') then perform public.dmp_demo_seed_technician(s.company_id,target); end if;
   insert into public.dmp_demo_scenarios values(s.company_id,'technical') on conflict do nothing;
   select id into work from public.work_orders where company_id=s.company_id and code='PAR-DEMO';
  end if;
  update public.dmp_demo_sessions set work_order_id=work where id=s.id;
 end if;
 perform public.dmp_demo_seed_business(s.company_id,p_role);
 return public.dmp_demo_session();
end $$;

create or replace function public.dmp_demo_progress() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c uuid:=public.current_company_id(); w uuid; technical boolean;
begin
 if c is null then raise exception 'Demo: sesión caducada'; end if;
 select role_name='Tecnico',work_order_id into technical,w from public.dmp_demo_sessions where auth_user_id=auth.uid();
 return jsonb_build_object(
 'clients',(select count(*) from clients where company_id=c and deleted_at is null),
 'sites',(select count(*) from sites where company_id=c and deleted_at is null),
 'equipment',(select count(*) from equipment where company_id=c and deleted_at is null),
 'works',(select count(*) from work_orders where company_id=c and deleted_at is null),
 'assignments',(select count(*) from work_order_assignments where company_id=c and deleted_at is null),
 'checks',(select count(*) from check_item_results r join checks ch on ch.id=r.check_id where r.company_id=c and r.result<>'Sin revisar' and (not technical or ch.work_order_id=w)),
 'photos',(select count(*) from check_photos ph join checks ch on ch.id=ph.check_id where ph.company_id=c and (not technical or ch.work_order_id=w)),
 'times',(select count(*) from work_order_time_entries where company_id=c and (not technical or work_order_id=w)),
 'work_notes',(select count(*) from work_orders where company_id=c and nullif(trim(work_performed),'') is not null and (not technical or id=w)),
 'signatures',(select count(*) from work_order_signatures where company_id=c and (not technical or work_order_id=w)),
 'completed_work',(select count(*) from work_orders where company_id=c and status in('Finalizado tecnicamente','Enviado','Cerrado') and (not technical or id=w)),
 'sat_approved',(select count(*) from work_orders where company_id=c and sat_review_status='approved'),
 'invoices',(select count(*) from invoices where company_id=c and status<>'anulada'),
 'payments',(select count(*) from invoice_payments where company_id=c));
end $$;
create or replace function public.dmp_demo_status() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('ready',enabled,'version',1,'journeys',2) from public.dmp_demo_config where id
$$;
revoke all on function public.dmp_demo_prepare_team(uuid),public.dmp_demo_seed_business(uuid,text),public.dmp_demo_prepare_journey(text),public.dmp_demo_progress() from public,anon,authenticated;
grant execute on function public.dmp_demo_prepare_journey(text),public.dmp_demo_progress() to authenticated;
notify pgrst,'reload schema';
commit;
