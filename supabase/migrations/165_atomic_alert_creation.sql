begin;

-- Invoker: both inserts continue to enforce the existing table grants and RLS.
-- The client must reuse p_operation_id when retrying an uncertain response.
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
  elsif department is null or department not in ('SAT','Comercial','Oficina','Gerencia','Tecnico') then
   raise exception 'validacion del formulario: selecciona un destinatario valido';
  end if;
 end loop;
 insert into public.alerts(id,company_id,created_by,code,title,description,type,priority,status,
  alert_date,related_entity,related_id)
 values(p_operation_id,company,actor,'',btrim(p_payload->>'title'),p_payload->>'description',
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
notify pgrst, 'reload schema';
commit;
