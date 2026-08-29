-- 092 remote RPC probe. Read-only. Never invokes the function.
-- The local definition is embedded so the comparison is independent of local files at execution time.
with local_definition as (
  select $local$create or replace function public.dmp_delete_invoice_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles := public.dmp024_active_profile();
  v_invoice public.invoices;
  v_lines jsonb;
  v_line_count integer;
begin
  if not public.has_any_role(array['superadmin','Gerencia','Oficina']) then
    raise exception 'permiso: no tienes permiso para eliminar borradores';
  end if;
  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if v_invoice.id is null then
    raise exception 'factura: borrador no encontrado';
  end if;

  perform public.assert_member_of_current_company(v_invoice.company_id);
  if v_invoice.status <> 'borrador' then
    raise exception 'factura: solo se pueden eliminar borradores';
  end if;
  if v_invoice.code is not null then
    raise exception 'factura: el borrador tiene numero fiscal y no puede eliminarse';
  end if;
  if v_invoice.fiscal_snapshot is not null then
    raise exception 'factura: el borrador tiene snapshot fiscal y no puede eliminarse';
  end if;
  if exists (select 1 from public.invoice_payments where invoice_id = v_invoice.id) then
    raise exception 'factura: existen movimientos de cobro y el borrador no puede eliminarse';
  end if;

  select count(*), coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb)
    into v_line_count, v_lines
  from public.invoice_work_orders l
  where l.invoice_id = v_invoice.id;

  -- DELETE is an existing audit operation; no new audit constraint value is needed.
  insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data)
  values (
    v_invoice.company_id,
    'invoices',
    v_invoice.id,
    'DELETE',
    jsonb_build_object('invoice', to_jsonb(v_invoice), 'lines', v_lines),
    jsonb_build_object('reason', 'DELETE_INVOICE_DRAFT', 'line_count', v_line_count)
  );

  delete from public.invoice_work_orders where invoice_id = v_invoice.id;
  delete from public.invoices where id = v_invoice.id and status = 'borrador';

  if not found then
    raise exception 'factura: el borrador cambio durante la eliminacion';
  end if;
end;
$$;$local$::text as definition
), target as (
  select p.oid, p.prosecdef, p.proconfig, p.proowner, pg_get_function_identity_arguments(p.oid) as exact_signature,
    pg_get_functiondef(p.oid) as remote_definition
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'dmp_delete_invoice_draft'
), summary as (
  select count(*)::bigint as overload_count,
    count(*) filter (where exact_signature = 'p_invoice_id uuid')::bigint as exact_count,
    max(remote_definition) filter (where exact_signature = 'p_invoice_id uuid') as remote_definition,
    bool_or(prosecdef) filter (where exact_signature = 'p_invoice_id uuid') as security_definer,
    max(proconfig) filter (where exact_signature = 'p_invoice_id uuid') as function_config,
    max(proowner) filter (where exact_signature = 'p_invoice_id uuid') as owner_oid
  from target
), history_candidates as (
  select string_agg(table_schema || '.' || table_name, ', ' order by table_schema, table_name) as tables
  from information_schema.tables
  where table_schema not in ('pg_catalog', 'information_schema')
    and (table_name ilike '%migration%' or table_schema ilike '%migration%')
)
select
  (s.exact_count = 1) as function_exists,
  case when s.exact_count = 1 then s.exact_count = 1 else false end as exact_signature,
  s.overload_count,
  s.remote_definition as pg_get_functiondef,
  case when s.exact_count = 1 then md5(regexp_replace(lower(s.remote_definition), '\s+', '', 'g')) end as function_definition_hash,
  md5(regexp_replace(lower(l.definition), '\s+', '', 'g')) as local_092_definition_hash,
  case when s.exact_count = 1 then md5(regexp_replace(lower(s.remote_definition), '\s+', '', 'g')) = md5(regexp_replace(lower(l.definition), '\s+', '', 'g')) else false end as definition_matches_local_092,
  coalesce(s.security_definer, false) as security_definer,
  coalesce(array_to_string(s.function_config, ', '), 'search_path no configurado') as search_path,
  case when s.owner_oid is not null then pg_get_userbyid(s.owner_oid) end as owner,
  case when s.exact_count = 1 then has_function_privilege('authenticated', 'public.dmp_delete_invoice_draft(uuid)', 'execute') else false end as authenticated_execute,
  case when s.exact_count = 1 then has_function_privilege('anon', 'public.dmp_delete_invoice_draft(uuid)', 'execute') else false end as anon_execute,
  case when hc.tables is null then 'DESCONOCIDO' else 'DESCONOCIDO' end as migration_092_recorded,
  hc.tables as migration_history_candidates,
  case when s.exact_count <> 1 then 'D_OVERLOAD_OR_MISSING' when md5(regexp_replace(lower(s.remote_definition), '\s+', '', 'g')) = md5(regexp_replace(lower(l.definition), '\s+', '', 'g')) then 'A_IDENTICA' when lower(s.remote_definition) like '%for update%' and lower(s.remote_definition) like '%delete from public.invoices%' then 'B_PARECIDA_O_INCOMPLETA' else 'C_DIFERENTE' end as decision,
  concat_ws('; ',
    case when s.exact_count <> 1 then 'firma exacta ausente o hay overloads' end,
    case when s.exact_count = 1 and not coalesce(s.security_definer, false) then 'no es SECURITY DEFINER' end,
    case when s.exact_count = 1 and not (coalesce(array_to_string(s.function_config, ', '), '') ilike '%search_path=public%') then 'search_path no es public' end,
    case when s.exact_count = 1 and not has_function_privilege('authenticated', 'public.dmp_delete_invoice_draft(uuid)', 'execute') then 'authenticated no tiene execute' end,
    case when s.exact_count = 1 and has_function_privilege('anon', 'public.dmp_delete_invoice_draft(uuid)', 'execute') then 'anon tiene execute' end
  ) as diagnostics
from summary s cross join local_definition l cross join history_candidates hc;
