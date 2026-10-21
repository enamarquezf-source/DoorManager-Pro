-- Read-only structural postflight after applying 175. Does not replace authenticated two-company testing.
begin;
do $$
declare signature regprocedure; definition text;
begin
  if not exists(select 1 from pg_class where oid = 'public.cost_productivity_studies'::regclass and relrowsecurity) then
    raise exception 'RLS no está activa en los estudios';
  end if;
  if has_table_privilege('anon','public.cost_productivity_studies','SELECT')
    or has_table_privilege('authenticated','public.cost_productivity_studies','INSERT,UPDATE,DELETE') then
    raise exception 'Permisos de tabla demasiado amplios';
  end if;
  if not has_table_privilege('authenticated','public.cost_productivity_studies','SELECT') then raise exception 'Falta SELECT autenticado'; end if;
  foreach signature in array array['public.dmp_cost_study_sources(date,date)'::regprocedure,'public.dmp_save_cost_study(uuid,text,date,date,jsonb)'::regprocedure] loop
    if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then
      raise exception 'Permisos incorrectos para %', signature;
    end if;
    select pg_get_functiondef(signature) into definition;
    if position('dmp_active_profile' in definition) = 0 or position('has_any_role' in definition) = 0 then raise exception 'Falta protección de actor o rol en %',signature; end if;
  end loop;
  if not exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'cost_productivity_studies' and policyname = 'cost_productivity_studies_read' and cmd = 'SELECT') then
    raise exception 'Falta la política de lectura';
  end if;
end;
$$;
-- Resolve every source column without reading business records.
select id,company_id,first_name,last_name from public.profiles limit 0;
select id,company_id,code,type,status,warranty,estimated_duration_minutes from public.work_orders limit 0;
select id,company_id,profile_id,work_order_id,work_date,duration_minutes,hour_type,total_cost from public.work_order_time_entries limit 0;
select id,company_id,work_order_id,deleted_at,used_at,total_cost from public.work_order_materials limit 0;
select id,company_id,work_order_id,deleted_at,incurred_at,total_cost from public.work_order_cost_entries limit 0;
select id,company_id,status,issue_date,subtotal from public.invoices limit 0;
rollback;
