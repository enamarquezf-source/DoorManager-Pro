-- DoorManager Pro - allow canonical purchase order code generation.
begin;

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

  if p_table_name <> all(array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes','purchase_orders']) then
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

revoke all on function public.next_dmp_code(uuid, text, text, boolean, integer) from public, anon;
grant execute on function public.next_dmp_code(uuid, text, text, boolean, integer) to authenticated;

commit;
