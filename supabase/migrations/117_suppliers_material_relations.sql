-- DoorManager Pro - functional suppliers catalog and material supplier relations.
begin;

alter table public.suppliers
  add constraint suppliers_company_id_id_unique unique (company_id, id);
alter table public.materials
  add constraint materials_company_id_id_unique unique (company_id, id);

-- Replace the initial FOR ALL policy so it cannot broaden this catalog's RLS.
drop policy if exists suppliers_company_policy on public.suppliers;

create table public.material_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  material_id uuid not null,
  supplier_id uuid not null,
  supplier_reference text,
  purchase_unit_price numeric(12,2) check (purchase_unit_price is null or purchase_unit_price >= 0),
  is_preferred boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_suppliers_material_company_fk
    foreign key (company_id, material_id) references public.materials(company_id, id),
  constraint material_suppliers_supplier_company_fk
    foreign key (company_id, supplier_id) references public.suppliers(company_id, id),
  constraint material_suppliers_unique_relation unique (company_id, material_id, supplier_id)
);

create unique index material_suppliers_one_preferred_idx
  on public.material_suppliers(company_id, material_id)
  where is_preferred = true and active = true;
create index material_suppliers_material_idx
  on public.material_suppliers(company_id, material_id, active);
create index material_suppliers_supplier_idx
  on public.material_suppliers(company_id, supplier_id, active);

alter table public.suppliers enable row level security;
alter table public.material_suppliers enable row level security;

create policy suppliers_select_backoffice on public.suppliers
  for select to authenticated
  using (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])
    and deleted_at is null);
create policy suppliers_insert_backoffice on public.suppliers
  for insert to authenticated
  with check (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy suppliers_update_backoffice on public.suppliers
  for update to authenticated
  using (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

create policy material_suppliers_select_backoffice on public.material_suppliers
  for select to authenticated
  using (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy material_suppliers_insert_backoffice on public.material_suppliers
  for insert to authenticated
  with check (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));
create policy material_suppliers_update_backoffice on public.material_suppliers
  for update to authenticated
  using (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))
  with check (company_id = public.current_company_id()
    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']));

grant select, insert, update on public.suppliers to authenticated;
grant select, insert, update on public.material_suppliers to authenticated;
revoke delete on public.suppliers from authenticated;
revoke delete on public.material_suppliers from authenticated;

commit;
