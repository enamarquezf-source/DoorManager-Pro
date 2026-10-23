-- All office-facing roles can start the client workflow shown in their UI.
begin;
drop policy if exists clients_insert_business on public.clients;
create policy clients_insert_business on public.clients for insert to authenticated
with check(company_id=public.current_company_id()
  and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']));
drop policy if exists clients_update_business on public.clients;
create policy clients_update_business on public.clients for update to authenticated
using(company_id=public.current_company_id()
  and public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']))
with check(company_id=public.current_company_id());
commit;
