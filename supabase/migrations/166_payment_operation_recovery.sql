begin;

-- Private operation ledger. Existing payments and balances are not backfilled.
create table if not exists public.payment_operation_receipts (
 operation_id uuid primary key,
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('customer','supplier')),
 payload jsonb not null,
 payment_id uuid not null,
 created_at timestamptz not null default now()
);
alter table public.payment_operation_receipts enable row level security;
revoke all on public.payment_operation_receipts from public,anon,authenticated;

create or replace function public.dmp_record_payment_once(
 p_operation_id uuid, p_kind text, p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 actor public.profiles := public.dmp024_active_profile();
 receipt public.payment_operation_receipts;
 result uuid;
begin
 if p_kind is null or p_kind not in ('customer','supplier') or p_operation_id is null
  or jsonb_typeof(p_payload) is distinct from 'object' then
  raise exception 'validacion del formulario: operacion de pago no valida';
 end if;
 if not (public.has_permission('treasury.transactions.create') or public.is_platform_superadmin())
  or not (public.has_permission(case when p_kind='customer' then 'billing.write' else 'supplier_payments.create' end)
   or public.is_platform_superadmin()) then
  raise exception 'permiso: no puedes registrar esta operacion de pago';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,166));
 select * into receipt from public.payment_operation_receipts where operation_id=p_operation_id;
 if found then
  if receipt.company_id is distinct from actor.company_id or receipt.actor_id is distinct from actor.id
   or receipt.kind is distinct from p_kind or receipt.payload is distinct from p_payload then
   raise exception 'validacion del formulario: el identificador de pago ya corresponde a otro envio';
  end if;
  return receipt.payment_id;
 end if;
 -- Existing RPCs retain invoice scope, status, overpayment, treasury and audit checks.
 if p_kind='customer' then
  result := public.dmp_record_invoice_payment(
   nullif(p_payload->>'invoice_id','')::uuid, (p_payload->>'amount')::numeric,
   nullif(p_payload->>'date','')::date,p_payload->>'method',p_payload->>'reference',p_payload->>'notes',
   nullif(p_payload->>'treasury_account_id','')::uuid);
 else
  result := public.dmp_record_supplier_payment(
   nullif(p_payload->>'invoice_id','')::uuid, (p_payload->>'amount')::numeric,
   nullif(p_payload->>'date','')::date,p_payload->>'method',p_payload->>'reference',p_payload->>'notes',
   nullif(p_payload->>'treasury_account_id','')::uuid);
 end if;
 if result is null then raise exception 'validacion del formulario: el pago no se ha registrado'; end if;
 insert into public.payment_operation_receipts(operation_id,company_id,actor_id,kind,payload,payment_id)
 values(p_operation_id,actor.company_id,actor.id,p_kind,p_payload,result);
 return result;
end $$;
revoke all on function public.dmp_record_payment_once(uuid,text,jsonb) from public,anon;
grant execute on function public.dmp_record_payment_once(uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
