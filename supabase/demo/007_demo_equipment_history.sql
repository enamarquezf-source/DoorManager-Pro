-- Only the isolated public demo. Install after 006; safe to run again.
begin;
do $$ begin
 if to_regprocedure('public.dmp_demo_prepare_team_before_procurement(uuid)') is null then raise exception 'Demo: instala primero 006'; end if;
 if to_regprocedure('public.dmp_demo_prepare_journey_before_history(text)') is null then
  alter function public.dmp_demo_prepare_journey(text) rename to dmp_demo_prepare_journey_before_history;
 end if;
end $$;
revoke all on function public.dmp_demo_prepare_journey_before_history(text) from public,anon,authenticated;

create or replace function public.dmp_demo_seed_equipment_history(c uuid) returns void
language plpgsql security definer set search_path=public as $$
declare e record; technician uuid; actor uuid; visit integer; visit_day date; work uuid; label text; description text;
begin
 if not exists(select 1 from public.dmp_demo_sessions where company_id=c and cleanup_state='pending' and ended_at is null and least(expires_at,absolute_expires_at)>now()) then return; end if;
 select profile_id into technician from public.dmp_demo_role_profiles where company_id=c and role_name='Tecnico';
 select profile_id into actor from public.dmp_demo_role_profiles where company_id=c and role_name='SAT';
 if technician is null or actor is null then return; end if;
 for e in select eq.*,et.name type_name from public.equipment eq join public.equipment_types et on et.id=eq.equipment_type_id
  where eq.company_id=c and eq.deleted_at is null and eq.code like 'EQ-DEMO-%' loop
  for visit in 1..2 loop
   label:='HIST-'||e.id::text||'-'||visit;
   if exists(select 1 from public.work_orders where company_id=c and code=label) then continue; end if;
   visit_day:=current_date-case when visit=1 then 120 else 35 end;
   description:=case
    when e.type_name='Puerta seccional' and visit=1 then 'SIMULACIÓN · Revisión de paneles, bisagras y rodillos. Limpieza de guías y lubricación de puntos de giro.'
    when e.type_name='Puerta seccional' then 'SIMULACIÓN · Ajuste de finales de carrera y equilibrado. Prueba de fotocélulas, banda de seguridad y desbloqueo manual.'
    when e.type_name='Puerta corredera' and visit=1 then 'SIMULACIÓN · Limpieza del carril, comprobación de ruedas y topes y ajuste de la cremallera.'
    when e.type_name='Puerta corredera' then 'SIMULACIÓN · Corrección de una desalineación de fotocélulas. Comprobación de parada e inversión ante obstáculos.'
    when visit=1 then 'SIMULACIÓN · Reapriete de anclajes del armario y fijaciones del asta. Comprobación del contrapeso.'
    else 'SIMULACIÓN · Ajuste del recorrido del asta y prueba de detección de obstáculos y desbloqueo manual.' end;
   insert into public.work_orders(company_id,code,client_id,site_id,main_equipment_id,title,description,type,origin,created_by,created_role,main_technician_id,current_responsible_id,scheduled_date,status,work_performed,result,finished_at,billable,created_at,updated_at,sat_review_status,office_validation_status)
   values(c,label,e.client_id,e.site_id,e.id,case when visit=1 then 'Visita anterior · mantenimiento de ejemplo' else 'Visita anterior · ajuste y seguridad de ejemplo' end,
    'Antecedente ficticio del equipo. No corresponde a una intervención real ni genera facturación.','Mantenimiento','SAT',actor,'SAT',technician,actor,visit_day,'Finalizado tecnicamente',description,
    case when visit=1 then 'SIMULACIÓN · Funcionamiento favorable tras mantenimiento. Sin defectos pendientes en esta visita.' else 'SIMULACIÓN · Funcionamiento verificado tras el ajuste. Revisar de nuevo en la visita actual.' end,
    visit_day::timestamptz,false,visit_day::timestamptz,visit_day::timestamptz,'approved','validated') returning id into work;
  end loop;
 end loop;
end $$;
revoke all on function public.dmp_demo_seed_equipment_history(uuid) from public,anon,authenticated;

create or replace function public.dmp_demo_prepare_journey(p_role text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 result:=public.dmp_demo_prepare_journey_before_history(p_role);
 perform public.dmp_demo_seed_equipment_history((result->>'company_id')::uuid);
 return result;
end $$;
revoke all on function public.dmp_demo_prepare_journey(text) from public,anon,authenticated;
grant execute on function public.dmp_demo_prepare_journey(text) to authenticated;
-- Existing live visitors receive the same history; their current answers stay intact.
do $$ declare c uuid; begin
 for c in select company_id from public.dmp_demo_sessions where cleanup_state='pending' and ended_at is null and least(expires_at,absolute_expires_at)>now() loop
  perform public.dmp_demo_seed_equipment_history(c);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
