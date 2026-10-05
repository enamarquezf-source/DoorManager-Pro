begin;

-- Receipts belong to the caller's company/session context, even when a platform
-- administrator is authorized by dmp_save_document to edit another company.
create table if not exists public.document_operation_receipts (
 operation_id uuid primary key,
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references public.profiles(id),
 payload jsonb not null,
 document_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.document_operation_receipts enable row level security;
revoke all on table public.document_operation_receipts from public,anon,authenticated;

create or replace function public.dmp_save_document_once(p_operation_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
 v_actor public.profiles:=public.dmp024_active_profile();
 v_receipt public.document_operation_receipts;
 v_document_id uuid;
begin
 if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
  raise exception 'validacion del formulario: envio documental no valido';
 end if;
 if not public.has_permission(case when nullif(p_payload->>'id','') is null then 'documents.create' else 'documents.update' end) then
  raise exception 'permiso: no puedes guardar documentos';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,170));
 select * into v_receipt from public.document_operation_receipts where operation_id=p_operation_id;
 if found then
  if v_receipt.company_id is distinct from v_actor.company_id
   or v_receipt.actor_id is distinct from v_actor.id
   or v_receipt.payload is distinct from p_payload then
   raise exception 'validacion del formulario: el envio pendiente no coincide con esta solicitud';
  end if;
  -- Never create another document or resurrect a later deleted document on retry.
  return v_receipt.document_id;
 end if;
 -- Keep the existing tenant, PRL, private object, link and metadata validations.
 v_document_id:=public.dmp_save_document(p_payload);
 if v_document_id is null then raise exception 'validacion del formulario: documento no guardado'; end if;
 insert into public.document_operation_receipts(operation_id,company_id,actor_id,payload,document_id)
 values(p_operation_id,v_actor.company_id,v_actor.id,p_payload,v_document_id);
 return v_document_id;
end;
$$;
revoke all on function public.dmp_save_document_once(uuid,jsonb) from public,anon;
grant execute on function public.dmp_save_document_once(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
