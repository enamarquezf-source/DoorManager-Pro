-- Administrative management is separate from the recipient's personal inbox.
begin;
create or replace function public.dmp_list_manageable_alerts()
returns setof jsonb language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile();
begin
 if not coalesce(public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']),false)
 or not coalesce(public.has_permission('alerts.delete'),false) then
  raise exception 'permiso: no puedes gestionar los avisos enviados';
 end if;
 return query select to_jsonb(a)||jsonb_build_object('recipients',coalesce((
  select jsonb_agg(jsonb_build_object('role',r.recipient_role,'profile_id',r.recipient_profile_id,
    'name',nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),'')))
  from public.alert_recipients r left join public.profiles p on p.id=r.recipient_profile_id and p.company_id=r.company_id
  where r.alert_id=a.id and r.company_id=a.company_id
 ),'[]'::jsonb))
 from public.alerts a where a.company_id=v_actor.company_id and a.deleted_at is null
 order by a.alert_date desc;
end $$;
revoke all on function public.dmp_list_manageable_alerts() from public,anon;
grant execute on function public.dmp_list_manageable_alerts() to authenticated;
notify pgrst,'reload schema';
commit;
