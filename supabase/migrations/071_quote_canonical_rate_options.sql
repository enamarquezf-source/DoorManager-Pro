-- DoorManager Pro - canonical rate options for quote lines.
-- The quote date selects the generic applicable version; quote line triggers
-- continue to own the immutable economic snapshot.

begin;

create or replace function public.dmp_quote_rate_options(p_quote_id uuid)
returns table(
  concept_id uuid,
  rate_version_id uuid,
  code text,
  name text,
  kind text,
  classification text,
  unit text,
  billing_mode text,
  period_days integer,
  contributes_to_sale boolean,
  cost_amount numeric,
  sale_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_issue_date date;
begin
  if not public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina']) then
    raise exception 'No tienes permisos para consultar tarifas de presupuestos';
  end if;

  select q.company_id, q.issue_date
    into v_company_id, v_issue_date
  from public.quotes q
  where q.id = p_quote_id
    and q.company_id = public.current_company_id()
    and q.deleted_at is null;

  if v_company_id is null then
    raise exception 'Presupuesto no encontrado o fuera de la empresa';
  end if;

  return query
  select c.id, v.id, c.code, c.name, c.kind, c.classification,
    c.unit, c.billing_mode, c.period_days, c.contributes_to_sale,
    v.cost_amount, v.sale_amount
  from public.rate_catalog c
  join lateral (
    select rv.id, rv.cost_amount, rv.sale_amount
    from public.rate_versions rv
    where rv.company_id = v_company_id
      and rv.rate_id = c.id
      and rv.technician_profile_id is null
      and rv.active
      and rv.deleted_at is null
      and rv.valid_from <= coalesce(v_issue_date, current_date)
      and (rv.valid_to is null or rv.valid_to >= coalesce(v_issue_date, current_date))
    order by rv.valid_from desc, rv.created_at desc
    limit 1
  ) v on true
  where c.company_id = v_company_id
    and c.active
    and c.deleted_at is null
    and c.kind in ('labor', 'cost')
    and c.classification in ('labor', 'cost')
    and v.sale_amount >= 0
  order by c.name;
end;
$$;

revoke all on function public.dmp_quote_rate_options(uuid) from public;
revoke all on function public.dmp_quote_rate_options(uuid) from anon;
grant execute on function public.dmp_quote_rate_options(uuid) to authenticated;

commit;
