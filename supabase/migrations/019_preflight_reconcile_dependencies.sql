-- DoorManager Pro - preflight para reconciliar dependencias reales antes de 019/020
-- Idempotente. No reejecuta migraciones historicas completas ni modifica datos/policies.

begin;

create or replace function public.has_any_role(role_names text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_superadmin()
    or exists (
      select 1
      from public.profiles p
      where p.id = public.current_profile_id()
        and p.active = true
        and p.deleted_at is null
        and p.company_id = public.current_company_id()
        and p.primary_area = any(role_names)
    )
    or exists (
      select 1
      from public.profile_roles pr
      join public.roles r on r.id = pr.role_id
      join public.profiles p on p.id = pr.profile_id
      where p.id = public.current_profile_id()
        and p.active = true
        and p.deleted_at is null
        and p.company_id = public.current_company_id()
        and r.name = any(role_names)
    );
$$;

create or replace function public.is_assigned_to_work_order(
  p_work_order_id uuid,
  p_profile_id uuid default public.current_profile_id()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_profile_id is not null and (
    exists (
      select 1
      from public.work_orders wo
      where wo.id = p_work_order_id
        and wo.company_id = public.current_company_id()
        and wo.deleted_at is null
        and (wo.main_technician_id = p_profile_id or wo.current_responsible_id = p_profile_id)
    )
    or exists (
      select 1
      from public.work_order_assignments a
      where a.work_order_id = p_work_order_id
        and a.company_id = public.current_company_id()
        and a.technician_id = p_profile_id
        and a.deleted_at is null
    )
    or exists (
      select 1
      from public.checks ch
      where ch.work_order_id = p_work_order_id
        and ch.company_id = public.current_company_id()
        and ch.technician_id = p_profile_id
        and ch.deleted_at is null
    )
  );
$$;

create or replace function public.next_dmp_code(
  p_company_id uuid,
  p_table_name text,
  p_prefix text,
  p_yearly boolean default false,
  p_width integer default 6
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_base text;
  v_sequence integer;
  v_start integer;
begin
  perform public.assert_member_of_current_company(p_company_id);

  if p_table_name <> all(array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes']) then
    raise exception 'Tabla no permitida para generar codigo: %', p_table_name;
  end if;
  if nullif(p_prefix, '') is null then
    raise exception 'Prefijo de codigo obligatorio';
  end if;

  v_base := case when p_yearly then p_prefix || '-' || v_year || '-' else p_prefix || '-' end;
  v_start := length(v_base) + 1;
  perform pg_advisory_xact_lock(hashtext(p_company_id::text || ':' || p_table_name || ':' || v_base));

  execute format(
    'select coalesce(max(substring(code from $2)::integer), 0) + 1
       from public.%I
      where company_id = $1
        and code like $3
        and substring(code from $2) ~ ''^[0-9]+$''',
    p_table_name
  ) into v_sequence using p_company_id, v_start, v_base || '%';

  return v_base || lpad(v_sequence::text, greatest(p_width, 1), '0');
end;
$$;

grant execute on function public.has_any_role(text[]) to authenticated;
grant execute on function public.is_assigned_to_work_order(uuid, uuid) to authenticated;
grant execute on function public.next_dmp_code(uuid, text, text, boolean, integer) to authenticated;

commit;
