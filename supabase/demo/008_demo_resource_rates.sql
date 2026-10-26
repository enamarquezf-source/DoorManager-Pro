-- Dedicated public demo only. Install after 007. No real charges or payments.
begin;
do $$ begin
 if to_regprocedure('public.dmp_demo_prepare_journey_before_history(text)') is null then raise exception 'Demo: instala primero 007'; end if;
 if to_regprocedure('public.dmp_demo_prepare_team_before_resources(uuid)') is null then
  alter function public.dmp_demo_prepare_team(uuid) rename to dmp_demo_prepare_team_before_resources;
 end if;
end $$;
revoke all on function public.dmp_demo_prepare_team_before_resources(uuid) from public,anon,authenticated;
create or replace function public.dmp_demo_prepare_resource_rates(c uuid) returns void
language plpgsql security definer set search_path=public as $$
declare item record; rate uuid;
begin
 if not exists(select 1 from public.dmp_demo_sessions where company_id=c) then raise exception 'Demo: empresa no temporal'; end if;
 for item in select * from (values
  ('desplazamiento','Kilometraje · simulación','km','unit',0.30::numeric,0.60::numeric),
  ('salida_demo','Desplazamiento zona próxima · simulación','ud','unit',12::numeric,25::numeric),
  ('plataforma_demo','Plataforma elevadora · simulación','dia','day',80::numeric,120::numeric)
 ) v(code,name,unit,billing_mode,cost_amount,sale_amount) loop
  insert into public.rate_catalog(company_id,code,name,kind,classification,unit,billing_mode,contributes_to_sale,notes)
   values(c,item.code,item.name,'cost','cost',item.unit,item.billing_mode,true,'Importes ficticios para probar recursos y desplazamientos. No generan cargos reales.')
   on conflict(company_id,code) do nothing;
  select id into rate from public.rate_catalog where company_id=c and code=item.code and deleted_at is null and active;
  if rate is not null and not exists(select 1 from public.rate_versions where company_id=c and rate_id=rate and active and deleted_at is null) then
   insert into public.rate_versions(company_id,rate_id,cost_amount,sale_amount,valid_from,notes)
    values(c,rate,item.cost_amount,item.sale_amount,date '2020-01-01','Versión ficticia para la demo');
  end if;
 end loop;
end $$;
revoke all on function public.dmp_demo_prepare_resource_rates(uuid) from public,anon,authenticated;
create or replace function public.dmp_demo_prepare_team(c uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.dmp_demo_prepare_team_before_resources(c);
 perform public.dmp_demo_prepare_resource_rates(c);
end $$;
revoke all on function public.dmp_demo_prepare_team(uuid) from public,anon,authenticated;
do $$ declare c uuid; begin
 for c in select company_id from public.dmp_demo_sessions where cleanup_state='pending' and ended_at is null and least(expires_at,absolute_expires_at)>now() loop
  perform public.dmp_demo_prepare_resource_rates(c);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
