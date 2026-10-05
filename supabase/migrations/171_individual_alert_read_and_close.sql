begin;
alter table public.alert_recipients drop constraint if exists alert_recipients_recipient_role_check;
alter table public.alert_recipients add constraint alert_recipients_recipient_role_check
 check(recipient_role in ('SAT','Comercial','Oficina','Gerencia','Tecnico','Todos'));

create table if not exists public.alert_personal_states (
 recipient_id uuid not null references public.alert_recipients(id) on delete cascade,
 profile_id uuid not null references public.profiles(id),
 company_id uuid not null references public.companies(id),
 is_read boolean not null default false,
 read_at timestamptz,
 closed_at timestamptz,
 primary key(recipient_id,profile_id)
);
alter table public.alert_personal_states enable row level security;
revoke all on table public.alert_personal_states from public,anon,authenticated;

create or replace function public.dmp_create_alert_atomic(
 p_operation_id uuid, p_payload jsonb, p_recipients jsonb
) returns public.alerts
language plpgsql security invoker set search_path=public as $$
declare
 actor uuid := public.current_profile_id();
 company uuid := public.current_company_id();
 result public.alerts;
 target jsonb;
 person uuid;
 department text;
begin
 if actor is null or company is null or not exists (
  select 1 from public.profiles p where p.id=actor and p.company_id=company
   and p.active and p.deleted_at is null
 ) or not public.has_any_role(array['superadmin','SAT','Gerencia','Comercial','Oficina']) then
  raise exception 'permiso: no puedes crear avisos';
 end if;
 if p_operation_id is null then
  raise exception 'validacion del formulario: falta el identificador de la operacion';
 end if;
 -- Serializes retries even before the alert row exists.
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
 select * into result from public.alerts where id=p_operation_id;
 if found then
  if result.company_id is distinct from company or result.created_by is distinct from actor
   or result.deleted_at is not null then
   raise exception 'permiso: operacion de aviso no disponible';
  end if;
  return result;
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object'
  or nullif(btrim(p_payload->>'title'),'') is null then
  raise exception 'validacion del formulario: el titulo del aviso es obligatorio';
 end if;
 if jsonb_typeof(p_recipients) is distinct from 'array' then
  raise exception 'validacion del formulario: destinatarios no validos';
 end if;
 if jsonb_array_length(p_recipients)=0 then
  raise exception 'validacion del formulario: selecciona al menos un destinatario';
 end if;
 -- Validate every destination before inserting; a later error also rolls back both inserts.
 for target in select value from jsonb_array_elements(p_recipients) loop
  person := nullif(btrim(target->>'profile_id'),'')::uuid;
  department := nullif(btrim(target->>'role'),'');
  if person is not null then
   if not exists(select 1 from public.profiles p where p.id=person and p.company_id=company
    and p.active and p.deleted_at is null) then
    raise exception 'empresa: destinatario no disponible en esta empresa';
   end if;
  elsif department is null or department not in ('SAT','Comercial','Oficina','Gerencia','Tecnico','Todos') then
   raise exception 'validacion del formulario: selecciona un destinatario valido';
  end if;
 end loop;
 insert into public.alerts(id,company_id,created_by,code,title,description,type,priority,status,
  alert_date,related_entity,related_id)
 values(p_operation_id,company,actor,public.next_dmp_code(company,'alerts','AVI',true,6),btrim(p_payload->>'title'),p_payload->>'description',
  coalesce(p_payload->>'type','Operativo'),coalesce(p_payload->>'priority','Normal'),
  coalesce(p_payload->>'status','Abierto'),coalesce(nullif(p_payload->>'alert_date','')::timestamptz,now()),
  nullif(p_payload->>'related_entity',''),nullif(p_payload->>'related_id','')::uuid)
 returning * into result;
 insert into public.alert_recipients(company_id,alert_id,recipient_profile_id,recipient_role)
 select distinct company,result.id,nullif(btrim(value->>'profile_id'),'')::uuid,
  case when nullif(btrim(value->>'profile_id'),'') is null then nullif(btrim(value->>'role'),'') end
 from jsonb_array_elements(p_recipients);
 return result;
end $$;
revoke all on function public.dmp_create_alert_atomic(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.dmp_create_alert_atomic(uuid,jsonb,jsonb) to authenticated;

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
  and (ar.company_id=v_actor.company_id or public.is_platform_superadmin())
  and (public.has_any_role(array['superadmin','SAT','Oficina','Gerencia'])
   or ar.recipient_profile_id=v_actor.id
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
 where id=p_recipient_id and (company_id=v_actor.company_id or public.is_platform_superadmin());
 if v_row.id is null or not exists(select 1 from public.alerts al where al.id=v_row.alert_id and al.company_id=v_row.company_id and al.deleted_at is null)
  or not (public.has_any_role(array['superadmin','SAT','Oficina','Gerencia'])
   or v_row.recipient_profile_id=v_actor.id
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
notify pgrst,'reload schema';
commit;
