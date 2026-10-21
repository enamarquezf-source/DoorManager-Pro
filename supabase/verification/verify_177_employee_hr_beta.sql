-- Structural postflight. Run authenticated two-company and document access tests before production.
begin;
do $$
declare signature regprocedure; definition text;
begin
 if not exists(select 1 from pg_class where oid='public.employee_hr_records'::regclass and relrowsecurity) then raise exception 'Falta RLS laboral'; end if;
 if has_table_privilege('anon','public.employee_hr_records','SELECT') or has_table_privilege('authenticated','public.employee_hr_records','INSERT,UPDATE,DELETE') then raise exception 'Permisos laborales demasiado amplios'; end if;
 if not exists(select 1 from storage.buckets where id='dmp-hr' and not public and file_size_limit=10485760) then raise exception 'Bucket laboral privado no configurado'; end if;
 foreach signature in array array['public.dmp_employee_hr(uuid)'::regprocedure,'public.dmp_save_employee_hr(uuid,uuid,text,date,date,jsonb,text,text)'::regprocedure] loop
  if has_function_privilege('anon',signature,'EXECUTE') or not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Permisos incorrectos: %',signature; end if;
  select pg_get_functiondef(signature) into definition;
  if position('dmp_active_profile' in definition)=0 or position('has_any_role' in definition)=0 then raise exception 'Falta control de actor o rol'; end if;
 end loop;
 if has_function_privilege('authenticated','public.dmp_cost_study_operational_sources(date,date)','EXECUTE') then raise exception 'La fuente interna debe permanecer privada'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='employee_hr_files_guard' and permissive='RESTRICTIVE') then raise exception 'Falta aislamiento del bucket laboral'; end if;
end;
$$;
rollback;
