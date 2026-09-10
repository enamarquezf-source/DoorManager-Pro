-- DoorManager Pro - supplier master data for the future purchasing circuit.
-- No supplier balances, invoices, payments or cash data are stored here.
begin;

alter table public.suppliers
  add column if not exists trade_name text,
  add column if not exists internal_code text,
  add column if not exists contact_name text,
  add column if not exists website text,
  add column if not exists fiscal_address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text,
  add column if not exists payment_method text,
  add column if not exists payment_terms_days integer,
  add column if not exists payment_due_day integer,
  add column if not exists currency_code text,
  add column if not exists usual_discount numeric(5,2),
  add column if not exists supplier_customer_reference text,
  add column if not exists billing_email text,
  add column if not exists billing_notes text,
  add column if not exists internal_notes text;

alter table public.suppliers
  drop constraint if exists suppliers_payment_method_check,
  drop constraint if exists suppliers_payment_terms_days_check,
  drop constraint if exists suppliers_payment_due_day_check,
  drop constraint if exists suppliers_currency_code_check,
  drop constraint if exists suppliers_usual_discount_check;
alter table public.suppliers
  add constraint suppliers_payment_method_check check (payment_method is null or payment_method in ('transferencia','domiciliacion','confirming','tarjeta','efectivo','otra')),
  add constraint suppliers_payment_terms_days_check check (payment_terms_days is null or payment_terms_days >= 0),
  add constraint suppliers_payment_due_day_check check (payment_due_day is null or payment_due_day between 1 and 31),
  add constraint suppliers_currency_code_check check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  add constraint suppliers_usual_discount_check check (usual_discount is null or usual_discount between 0 and 100);

create unique index if not exists suppliers_company_internal_code_unique
  on public.suppliers(company_id, internal_code)
  where internal_code is not null and deleted_at is null;

create table public.supplier_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  account_holder text,
  iban text,
  bic_swift text,
  is_primary boolean not null default false,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_bank_accounts_supplier_company_fk foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  constraint supplier_bank_accounts_iban_check check (iban is null or length(regexp_replace(upper(iban), '\s+', '', 'g')) between 5 and 34)
);

create unique index supplier_bank_accounts_primary_unique
  on public.supplier_bank_accounts(company_id, supplier_id)
  where is_primary = true and active = true;
create unique index supplier_bank_accounts_iban_unique
  on public.supplier_bank_accounts(company_id, supplier_id, upper(regexp_replace(iban, '\s+', '', 'g')))
  where iban is not null;
create index supplier_bank_accounts_supplier_idx
  on public.supplier_bank_accounts(company_id, supplier_id, active);

create or replace function public.dmp_supplier_bank_account_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.current_profile_id();
    if new.created_by is null then raise exception 'proveedor: no se pudo resolver el perfil creador'; end if;
    new.created_at := now();
    new.updated_at := now();
  else
    if new.id is distinct from old.id
       or new.company_id is distinct from old.company_id
       or new.supplier_id is distinct from old.supplier_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'proveedor: la identidad de la cuenta bancaria es inmutable';
    end if;
  end if;
  if new.is_primary and new.active then
    update public.supplier_bank_accounts
    set is_primary = false, updated_at = now()
    where company_id = new.company_id and supplier_id = new.supplier_id
      and id is distinct from new.id and is_primary and active;
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_bank_account_guard_trigger on public.supplier_bank_accounts;
create trigger supplier_bank_account_guard_trigger
before insert or update on public.supplier_bank_accounts
for each row execute function public.dmp_supplier_bank_account_guard();
drop trigger if exists supplier_bank_account_updated_at_trigger on public.supplier_bank_accounts;
create trigger supplier_bank_account_updated_at_trigger
before update on public.supplier_bank_accounts
for each row execute function public.set_updated_at();

alter table public.supplier_bank_accounts enable row level security;
create policy supplier_bank_accounts_select_admin on public.supplier_bank_accounts
  for select to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy supplier_bank_accounts_insert_admin on public.supplier_bank_accounts
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy supplier_bank_accounts_update_admin on public.supplier_bank_accounts
  for update to authenticated
  using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']))
  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Gerencia','Oficina']));
create policy supplier_bank_accounts_platform_superadmin_select on public.supplier_bank_accounts
  for select to authenticated using (public.is_platform_superadmin());
create policy supplier_bank_accounts_platform_superadmin_insert on public.supplier_bank_accounts
  for insert to authenticated with check (public.is_platform_superadmin());
create policy supplier_bank_accounts_platform_superadmin_update on public.supplier_bank_accounts
  for update to authenticated using (public.is_platform_superadmin()) with check (public.is_platform_superadmin());

revoke all privileges on public.supplier_bank_accounts from anon;
revoke delete, truncate, references, trigger on public.supplier_bank_accounts from authenticated;
grant select, insert, update on public.supplier_bank_accounts to authenticated;

commit;
