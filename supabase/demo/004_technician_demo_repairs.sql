-- Only the dedicated public demo project. Preserves existing sessions and checks.
begin;
do $$ begin if not exists(select 1 from public.dmp_demo_config) then raise exception 'Demo: configuración no instalada'; end if; end $$;
-- A check or a secondary work-order equipment link must expose its equipment
-- to the assigned technician, using the same scope as equipment photos.

drop policy if exists equipment_select_technician_linked on public.equipment;
create policy equipment_select_technician_linked on public.equipment
for select to authenticated using (
  company_id=public.current_company_id() and deleted_at is null
  and public.has_any_role(array['Tecnico'])
  and public.can_read_equipment_photo(id)
);

create or replace function public.dmp_demo_prepare_labor(c uuid) returns void language plpgsql security definer set search_path=public as $$
declare rate uuid;
begin
 if not exists(select 1 from public.dmp_demo_sessions where company_id=c) then raise exception 'Demo: empresa no temporal'; end if;
 insert into public.rate_catalog(company_id,code,name,kind,classification,unit,billing_mode,contributes_to_sale,notes)
 values(c,'tecnico','Hora técnica · simulación','labor','labor','h','hour',true,'Importes ficticios de demo: coste 22 EUR/h, venta 45 EUR/h')
 on conflict(company_id,code) do nothing;
 select id into rate from public.rate_catalog where company_id=c and code='tecnico';
 if not exists(select 1 from public.rate_versions where company_id=c and rate_id=rate and active and deleted_at is null) then
   insert into public.rate_versions(company_id,rate_id,cost_amount,sale_amount,valid_from,notes)
   values(c,rate,22,45,date '2020-01-01','Ejemplo ficticio para probar registro de horas');
 end if;
end $$;
revoke all on function public.dmp_demo_prepare_labor(uuid) from public,anon,authenticated;

create or replace function public.dmp_demo_seed_technician(c uuid,p uuid) returns void language plpgsql security definer set search_path=public as $$
declare client uuid; site uuid; work uuid; equipment uuid; equipment_type uuid; template uuid; section uuid;
 shape jsonb; section_data jsonb; label text; position integer; item_position integer;
begin
 perform public.dmp_demo_prepare_labor(c);
 insert into public.clients(company_id,code,legal_name,notes) values(c,'CLI-DEMO','Cliente ficticio · Demo','Escenario ficticio, sin datos reales') returning id into client;
 insert into public.sites(company_id,client_id,code,name,address) values(c,client,'CEN-DEMO','Centro de prueba','Ubicación ficticia · no desplazarse') returning id into site;
 insert into public.work_orders(company_id,code,client_id,site_id,title,description,type,origin,created_by,created_role,main_technician_id,current_responsible_id,scheduled_date,billable)
 values(c,'PAR-DEMO',client,site,'Tu primera revisión · tres equipos','Prueba los checks de cada equipo. Puedes marcar componentes favorables o con defecto, explicar el problema y añadir fotos ficticias.','Mantenimiento','Gerencia',p,'Tecnico',p,p,(now() at time zone 'Europe/Madrid')::date,false) returning id into work;
 insert into public.work_order_assignments(company_id,work_order_id,technician_id,assignment_date,assigned_by)
 values(c,work,p,(now() at time zone 'Europe/Madrid')::date,p);
 for shape in select value from jsonb_array_elements('[
   {"type":"Puerta seccional","sections":[{"title":"Hoja y guiado","items":["Paneles","Bisagras","Rodillos y guías"]},{"title":"Accionamiento","items":["Motor","Muelles y cables","Cuadro de maniobras"]},{"title":"Seguridad","items":["Fotocélulas","Banda de seguridad","Desbloqueo manual"]}]},
   {"type":"Puerta corredera","sections":[{"title":"Estructura","items":["Hoja","Carril y ruedas","Topes"]},{"title":"Accionamiento","items":["Motor","Cremallera","Finales de carrera"]},{"title":"Seguridad","items":["Fotocélulas","Banda de seguridad","Desbloqueo manual"]}]},
   {"type":"Barrera automática","sections":[{"title":"Armario","items":["Carcasa y anclajes","Motor","Cuadro de maniobras"]},{"title":"Asta","items":["Asta y fijaciones","Sistema de contrapeso"]},{"title":"Seguridad","items":["Fotocélulas","Detección de obstáculos","Desbloqueo manual"]}]}
 ]'::jsonb) loop
   insert into public.equipment_types(company_id,name,description) values(c,shape->>'type','Tipo ficticio para demostración') returning id into equipment_type;
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
   insert into public.equipment(company_id,code,client_id,site_id,equipment_type_id,model,internal_location)
   values(c,'EQ-DEMO-'||substr(equipment_type::text,1,8),client,site,equipment_type,'Modelo ficticio',shape->>'type') returning id into equipment;
   insert into public.work_order_equipment(company_id,work_order_id,equipment_id,is_primary) values(c,work,equipment,false);
 end loop;
 if (select count(*) from public.checks where work_order_id=work)<>3 then raise exception 'Demo: no se han preparado los tres checks'; end if;
 update public.dmp_demo_sessions set work_order_id=work where company_id=c;
end $$;
do $$ declare s record; begin for s in select company_id from public.dmp_demo_sessions where role_name='Tecnico' and cleanup_state='pending' loop perform public.dmp_demo_prepare_labor(s.company_id); end loop; end $$;
commit;
