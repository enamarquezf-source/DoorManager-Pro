-- DoorManager Pro - corrige resolucion runtime de empresa unica tras 049.
-- Seguro sobre BBDD con 049 aplicada. No elimina empresas, no reasigna datos y mantiene RLS.

begin;

create or replace function public.dmp_operating_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_count integer;
begin
  select count(*)
    into v_count
  from public.companies
  where active = true
    and deleted_at is null;

  if v_count = 0 then
    raise exception 'No hay una empresa operadora activa configurada';
  end if;

  if v_count > 1 then
    raise exception 'Hay varias empresas activas. Revisa dmp_single_company_audit antes de activar el modo de empresa unica';
  end if;

  select id
    into v_company_id
  from public.companies
  where active = true
    and deleted_at is null
  limit 1;

  return v_company_id;
end;
$$;

grant execute on function public.dmp_operating_company_id() to authenticated;

commit;
