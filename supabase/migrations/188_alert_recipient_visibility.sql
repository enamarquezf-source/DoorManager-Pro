-- Recipient-only inbox: roles do not grant access to another department's notices.
begin;
create or replace function public.dmp_list_personal_alerts(p_search text default '')
returns setof jsonb language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile();
begin
 return query
 select to_jsonb(ar)||jsonb_build_object(
  'alerts',to_jsonb(al),
  'is_read',coalesce(ps.is_read,case when ar.recipient_profile_id=v_actor.id then ar.is_read else false end),
  'read_at',case when ps.profile_id is not null then ps.read_at when ar.recipient_profile_id=v_actor.id then ar.read_at end,
  'closed_at',case when ps.profile_id is not null then ps.closed_at when ar.recipient_profile_id=v_actor.id then ar.closed_at end)
 from public.alert_recipients ar join public.alerts al on al.id=ar.alert_id and al.company_id=ar.company_id
 left join public.alert_personal_states ps on ps.recipient_id=ar.id and ps.profile_id=v_actor.id
 where al.deleted_at is null
  and ar.company_id=v_actor.company_id
  and (ar.recipient_profile_id=v_actor.id
   or (ar.recipient_profile_id is null and (ar.recipient_role='Todos' or public.has_any_role(array[ar.recipient_role]))))
  and (coalesce(p_search,'')='' or strpos(lower(coalesce(al.title,'')||' '||coalesce(al.description,'')||' '||coalesce(al.type,'')),lower(p_search))>0)
 order by ar.created_at desc;
end $$;
revoke all on function public.dmp_list_personal_alerts(text) from public,anon;
grant execute on function public.dmp_list_personal_alerts(text) to authenticated;

create or replace function public.dmp_update_alert_recipient(p_recipient_id uuid,p_action text)
returns public.alert_recipients language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_row public.alert_recipients; v_state public.alert_personal_states;
begin
 if p_action is null or p_action not in ('read','close','reopen') then raise exception 'validacion del formulario: accion de aviso no valida'; end if;
 select * into v_row from public.alert_recipients
 where id=p_recipient_id and company_id=v_actor.company_id;
 if v_row.id is null or not exists(select 1 from public.alerts al where al.id=v_row.alert_id and al.company_id=v_row.company_id and al.deleted_at is null)
  or not (coalesce(v_row.recipient_profile_id=v_actor.id,false)
   or (v_row.recipient_profile_id is null and (v_row.recipient_role='Todos' or public.has_any_role(array[v_row.recipient_role])))) then
  raise exception 'permiso: aviso no disponible para este usuario';
 end if;
 insert into public.alert_personal_states(recipient_id,profile_id,company_id,is_read,read_at,closed_at)
 values(v_row.id,v_actor.id,v_row.company_id,
  case when v_row.recipient_profile_id=v_actor.id then v_row.is_read else false end,
  case when v_row.recipient_profile_id=v_actor.id then v_row.read_at end,
  case when v_row.recipient_profile_id=v_actor.id then v_row.closed_at end)
 on conflict(recipient_id,profile_id) do nothing;
 update public.alert_personal_states set
  is_read=case when p_action in ('read','close') then true else is_read end,
  read_at=case when p_action in ('read','close') then coalesce(read_at,now()) else read_at end,
  closed_at=case when p_action='close' then coalesce(closed_at,now()) when p_action='reopen' then null else closed_at end
 where recipient_id=v_row.id and profile_id=v_actor.id returning * into v_state;
 return jsonb_populate_record(v_row,jsonb_build_object('is_read',v_state.is_read,'read_at',v_state.read_at,'closed_at',v_state.closed_at));
end $$;
revoke all on function public.dmp_update_alert_recipient(uuid,text) from public,anon;
grant execute on function public.dmp_update_alert_recipient(uuid,text) to authenticated;
-- The atomic creator validates company, author, role, payload and every destination
-- before writing. Definer execution lets the sender create a notice for others
-- without granting the sender read access to that destination's inbox.
alter function public.dmp_create_alert_atomic(uuid,jsonb,jsonb) security definer;

create or replace function public.dmp_is_alert_recipient(p_company uuid,p_person uuid,p_role text)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and p_company=public.current_company_id()
 and exists(select 1 from public.profiles p where p.id=public.current_profile_id()
   and p.company_id=p_company and p.active and p.deleted_at is null)
 and (p_person=public.current_profile_id() or
   (p_person is null and (p_role='Todos' or public.has_any_role(array[p_role]))));
$$;
revoke all on function public.dmp_is_alert_recipient(uuid,uuid,text) from public,anon;
grant execute on function public.dmp_is_alert_recipient(uuid,uuid,text) to authenticated;

create or replace function public.dmp_can_read_alert(p_alert uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.alerts a join public.alert_recipients r
 on r.alert_id=a.id and r.company_id=a.company_id where a.id=p_alert
 and a.deleted_at is null
 and public.dmp_is_alert_recipient(r.company_id,r.recipient_profile_id,r.recipient_role));
$$;
revoke all on function public.dmp_can_read_alert(uuid) from public,anon;
grant execute on function public.dmp_can_read_alert(uuid) to authenticated;

-- Restrictive policies also constrain older permissive administrator policies.
drop policy if exists alerts_recipient_only on public.alerts;
create policy alerts_recipient_only on public.alerts as restrictive for select to authenticated
 using(public.dmp_can_read_alert(id));
drop policy if exists alerts_recipient_read on public.alerts;
create policy alerts_recipient_read on public.alerts for select to authenticated
 using(public.dmp_can_read_alert(id));
drop policy if exists alert_recipients_recipient_only on public.alert_recipients;
create policy alert_recipients_recipient_only on public.alert_recipients as restrictive for select to authenticated
 using(public.dmp_is_alert_recipient(company_id,recipient_profile_id,recipient_role));
drop policy if exists alert_recipients_recipient_read on public.alert_recipients;
create policy alert_recipients_recipient_read on public.alert_recipients for select to authenticated
 using(public.dmp_is_alert_recipient(company_id,recipient_profile_id,recipient_role));
notify pgrst,'reload schema';
commit;
