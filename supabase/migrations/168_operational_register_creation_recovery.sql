begin;

-- Private receipts: no direct client read/write, no backfill of existing registers.
create table if not exists public.operational_creation_receipts (
 operation_id uuid primary key,
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('vehicle','prl')),
 payload jsonb not null,
 record_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.operational_creation_receipts enable row level security;
revoke all on table public.operational_creation_receipts from public,anon,authenticated;

create or replace function public.dmp_create_operational_register_once(
 p_operation_id uuid,p_kind text,p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 actor public.profiles:=public.dmp024_active_profile();
 receipt public.operational_creation_receipts;
 result uuid;
begin
 if p_operation_id is null or p_kind is null or p_kind not in ('vehicle','prl')
  or jsonb_typeof(p_payload) is distinct from 'object'
  or nullif(p_payload->>'id','') is not null then
  raise exception 'validacion del formulario: alta de registro no valida';
 end if;
 if not public.has_permission('documents.create')
  or not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then
  raise exception 'permiso: no puedes crear registros de flota o PRL';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,168));
 select * into receipt from public.operational_creation_receipts where operation_id=p_operation_id;
 if found then
  if receipt.company_id is distinct from actor.company_id
   or receipt.actor_id is distinct from actor.id
   or receipt.kind is distinct from p_kind
   or receipt.payload is distinct from p_payload then
   raise exception 'validacion del formulario: la operacion pendiente no coincide con este envio';
  end if;
  -- Even a subsequently deleted record remains the result of the original operation.
  -- A retry must never resurrect or duplicate it.
  return receipt.record_id;
 end if;
 result:=public.dmp_save_operational_register(p_kind,p_payload);
 if result is null then raise exception 'validacion del formulario: no se ha creado el registro'; end if;
 insert into public.operational_creation_receipts(operation_id,company_id,actor_id,kind,payload,record_id)
 values(p_operation_id,actor.company_id,actor.id,p_kind,p_payload,result);
 return result;
end;
$$;
revoke all on function public.dmp_create_operational_register_once(uuid,text,jsonb) from public,anon;
grant execute on function public.dmp_create_operational_register_once(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
