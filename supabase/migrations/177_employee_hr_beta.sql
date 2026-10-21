-- Private labour files and explicitly identified beta payroll simulations. No statutory rates are inferred.
begin;
create table if not exists public.employee_hr_records (
 id uuid primary key, company_id uuid not null references public.companies(id), profile_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('terms','vacation','payroll','contract')), date_from date not null, date_to date,
 payload jsonb not null check(jsonb_typeof(payload)='object'), file_path text, filename text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check(date_to is null or date_to>=date_from), unique(company_id,file_path)
);
create index if not exists employee_hr_records_person_idx on public.employee_hr_records(company_id,profile_id,date_from desc);
create unique index if not exists employee_hr_payroll_period_idx on public.employee_hr_records(company_id,profile_id,date_from,date_to,(payload->>'mode')) where kind='payroll';
create unique index if not exists employee_hr_terms_date_idx on public.employee_hr_records(company_id,profile_id,date_from) where kind='terms';
alter table public.employee_hr_records enable row level security;
revoke all on public.employee_hr_records from public,anon,authenticated;
grant select on public.employee_hr_records to authenticated;
drop policy if exists employee_hr_read on public.employee_hr_records;
create policy employee_hr_read on public.employee_hr_records for select to authenticated
 using(company_id=public.current_company_id() and public.has_any_role(array['superadmin','Gerencia']) and exists(select 1 from public.profiles p where p.id=public.current_profile_id() and p.active and p.deleted_at is null));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('dmp-hr','dmp-hr',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];
create or replace function public.dmp_hr_path_access(p_path text) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and public.has_any_role(array['superadmin','Gerencia'])
 and exists(select 1 from public.profiles a where a.auth_user_id=auth.uid() and a.active and a.deleted_at is null)
 and array_length(string_to_array(p_path,'/'),1)=3
 and split_part(p_path,'/',1)=public.current_company_id()::text
 and exists(select 1 from public.profiles p where p.id::text=split_part(p_path,'/',2) and p.company_id=public.current_company_id());
$$;
revoke all on function public.dmp_hr_path_access(text) from public,anon;
grant execute on function public.dmp_hr_path_access(text) to authenticated;
drop policy if exists employee_hr_files_read on storage.objects;
create policy employee_hr_files_read on storage.objects for select to authenticated using(bucket_id='dmp-hr' and public.dmp_hr_path_access(name));
drop policy if exists employee_hr_files_upload on storage.objects;
create policy employee_hr_files_upload on storage.objects for insert to authenticated with check(bucket_id='dmp-hr' and owner=auth.uid() and public.dmp_hr_path_access(name));
-- No updates/deletes on files: documents cannot be replaced in place.
-- Restrictive guards also protect this bucket if an installation has broader permissive storage policies.
drop policy if exists employee_hr_files_guard on storage.objects;
create policy employee_hr_files_guard on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'dmp-hr' or public.dmp_hr_path_access(name))
 with check(bucket_id<>'dmp-hr' or (owner=auth.uid() and public.dmp_hr_path_access(name)));
drop policy if exists employee_hr_files_anon_guard on storage.objects;
create policy employee_hr_files_anon_guard on storage.objects as restrictive for all to anon
 using(bucket_id<>'dmp-hr') with check(bucket_id<>'dmp-hr');
drop policy if exists employee_hr_files_no_update on storage.objects;
create policy employee_hr_files_no_update on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'dmp-hr') with check(bucket_id<>'dmp-hr');
drop policy if exists employee_hr_files_no_delete on storage.objects;
create policy employee_hr_files_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'dmp-hr');

create or replace function public.dmp_employee_hr(p_profile_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles; target public.profiles;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','Gerencia']) then raise exception 'Acceso laboral restringido'; end if;
 select * into target from public.profiles where id=p_profile_id and company_id=actor.company_id;
 if not found then raise exception 'Empleado fuera de la empresa'; end if;
 return jsonb_build_object('employee_name',concat_ws(' ',target.first_name,target.last_name),'company_name',(select name from public.companies where id=actor.company_id),
  'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.date_from desc,r.created_at desc) from public.employee_hr_records r where r.company_id=actor.company_id and r.profile_id=target.id),'[]'::jsonb));
end;
$$;
create or replace function public.dmp_save_employee_hr(p_id uuid,p_profile_id uuid,p_kind text,p_from date,p_to date,p_payload jsonb,p_path text default null,p_filename text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor public.profiles; previous public.employee_hr_records; value numeric; field text; data jsonb:=p_payload; gross numeric; overtime numeric; deductions numeric; metadata jsonb;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','Gerencia']) then raise exception 'Acceso laboral restringido'; end if;
 if not exists(select 1 from public.profiles where id=p_profile_id and company_id=actor.company_id) then raise exception 'Empleado fuera de la empresa'; end if;
 if p_id is null or p_kind is null or p_kind not in ('terms','vacation','payroll','contract') or p_from is null or (p_to is not null and p_to<p_from)
  or data is null or jsonb_typeof(data)<>'object' or pg_column_size(data)>65536 then raise exception 'Datos laborales no válidos'; end if;
 perform pg_advisory_xact_lock(hashtextextended('dmp:hr:'||actor.company_id::text||':'||p_profile_id::text,0));
 if p_kind='terms' then
  foreach field in array array['monthly_gross','employer_contributions','other_employer_costs','overtime_hourly_price','weekly_hours','vacation_days'] loop
   if jsonb_typeof(data->field) is distinct from 'number' then raise exception 'Falta el importe o jornada: %',field; end if;
   value:=(data->>field)::numeric; if value<0 or value>1e9 then raise exception 'Valor fuera de rango'; end if;
  end loop;
  if (data->>'weekly_hours')::numeric>168 or (data->>'vacation_days')::numeric>366 or coalesce(data->>'vacation_basis','') not in ('laborables','naturales') then raise exception 'Jornada o vacaciones no válidas'; end if;
  if length(coalesce(data->>'schedule',''))>4000 then raise exception 'Horario demasiado largo'; end if;
 elsif p_kind='vacation' then
  if p_to is null or p_to-p_from>365 or extract(year from p_to)<>extract(year from p_from) or coalesce(data->>'status','') not in ('planned','approved','cancelled') or coalesce(data->>'basis','') not in ('laborables','naturales') then raise exception 'Vacaciones: indica un intervalo del mismo año, unidad y estado'; end if;
  if jsonb_typeof(data->'days') is distinct from 'number' then raise exception 'Faltan los días de vacaciones'; end if;
  value:=(data->>'days')::numeric; if value<=0 or value>p_to-p_from+1 then raise exception 'Días de vacaciones no válidos'; end if;
  if data->>'status'='approved' and exists(select 1 from public.employee_hr_records r where r.company_id=actor.company_id and r.profile_id=p_profile_id and r.kind='vacation' and r.id<>p_id and r.payload->>'status'='approved' and daterange(r.date_from,r.date_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Ya existen vacaciones aprobadas en esas fechas'; end if;
 elsif p_kind='payroll' then
  if p_to is null or p_from<>date_trunc('month',p_from)::date or p_to<>(p_from+interval '1 month'-interval '1 day')::date or coalesce(data->>'mode','') not in ('actual','simulation') then raise exception 'La nómina debe abarcar un mes completo e indicar real o simulación'; end if;
  foreach field in array array['salary_base','supplements','overtime_hours','overtime_hourly_price','employee_deductions','employer_contributions','other_employer_costs'] loop
   if jsonb_typeof(data->field) is distinct from 'number' then raise exception 'Falta el importe de nómina: %',field; end if;
   value:=(data->>field)::numeric; if value<0 or value>1e9 then raise exception 'Importe fuera de rango'; end if;
  end loop;
  foreach field in array array['paid_hours','presence_hours'] loop
   if data->field is distinct from 'null'::jsonb then
    if jsonb_typeof(data->field) is distinct from 'number' then raise exception 'Horas no válidas'; end if;
    value:=(data->>field)::numeric; if value<0 or value>(p_to-p_from+1)*24 then raise exception 'Horas fuera de rango'; end if;
   end if;
  end loop;
  overtime:=round((data->>'overtime_hours')::numeric*(data->>'overtime_hourly_price')::numeric,2);
  if (data->>'overtime_hours')::numeric>(p_to-p_from+1)*24 then raise exception 'Las horas extra superan la duración del mes'; end if;
  gross:=round((data->>'salary_base')::numeric,2)+round((data->>'supplements')::numeric,2)+overtime;
  deductions:=round((data->>'employee_deductions')::numeric,2);
  if deductions>gross then raise exception 'Las deducciones superan el bruto'; end if;
  if data->>'mode'='actual' and p_path is null then raise exception 'Adjunta el PDF de la nómina real'; end if;
  data:=data||jsonb_build_object('overtime_amount',overtime,'gross_amount',gross,'net_amount',gross-deductions,'employer_cost',gross+round((data->>'employer_contributions')::numeric,2)+round((data->>'other_employer_costs')::numeric,2),'calculation_version',1,'statutory_calculation',false);
 elsif p_kind='contract' and (p_path is null or length(trim(coalesce(data->>'title','')))=0) then raise exception 'Contrato: indica un título y adjunta su PDF';
 end if;
 if p_path is not null then
  if not public.dmp_hr_path_access(p_path) or split_part(p_path,'/',2)<>p_profile_id::text or nullif(trim(p_filename),'') is null then raise exception 'Ruta de documento no válida'; end if;
  select o.metadata into metadata from storage.objects o where o.bucket_id='dmp-hr' and o.name=p_path and o.owner=auth.uid();
  if not found or coalesce(metadata->>'mimetype','')<>'application/pdf' or coalesce((metadata->>'size')::bigint,0) not between 1 and 10485760 then raise exception 'Adjunta un PDF de hasta 10 MB'; end if;
 end if;
 select * into previous from public.employee_hr_records where id=p_id;
 if found then
  if previous.company_id<>actor.company_id or previous.profile_id<>p_profile_id or previous.kind<>p_kind then raise exception 'El registro no pertenece a esta ficha'; end if;
  if previous.date_from=p_from and previous.date_to is not distinct from p_to and previous.payload=data and previous.file_path is not distinct from p_path and previous.filename is not distinct from p_filename then return previous.id; end if;
  if p_kind not in ('vacation','terms') then raise exception 'El registro ya está guardado; crea otro para conservar su historial'; end if;
  insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data) values(actor.company_id,'employee_hr_records',p_id,'UPDATE',actor.id,to_jsonb(previous),data);
  update public.employee_hr_records set payload=data,date_from=p_from,date_to=p_to where id=p_id;
  return p_id;
 end if;
 insert into public.employee_hr_records(id,company_id,profile_id,kind,date_from,date_to,payload,file_path,filename,created_by)
 values(p_id,actor.company_id,p_profile_id,p_kind,p_from,p_to,data,p_path,p_filename,actor.id);
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,new_data) values(actor.company_id,'employee_hr_records',p_id,'INSERT',actor.id,data);
 return p_id;
end;
$$;
revoke all on function public.dmp_employee_hr(uuid) from public,anon;
revoke all on function public.dmp_save_employee_hr(uuid,uuid,text,date,date,jsonb,text,text) from public,anon;
grant execute on function public.dmp_employee_hr(uuid) to authenticated;
grant execute on function public.dmp_save_employee_hr(uuid,uuid,text,date,date,jsonb,text,text) to authenticated;

-- Wrap the operational snapshot so HR figures are captured consistently, without changing its amounts.
do $$ begin
 if to_regprocedure('public.dmp_cost_study_operational_sources(date,date)') is null then
  alter function public.dmp_cost_study_sources(date,date) rename to dmp_cost_study_operational_sources;
 end if;
end $$;
revoke all on function public.dmp_cost_study_operational_sources(date,date) from public,anon,authenticated;
create or replace function public.dmp_cost_study_sources(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor public.profiles; base jsonb;
begin
 actor:=public.dmp_active_profile();
 if not public.has_any_role(array['superadmin','Gerencia']) then raise exception 'Acceso laboral restringido'; end if;
 base:=public.dmp_cost_study_operational_sources(p_from,p_to);
 return base||jsonb_build_object('hr_payroll_records',coalesce((select jsonb_agg(to_jsonb(r) order by r.date_from,r.id) from public.employee_hr_records r
  where r.company_id=actor.company_id and r.kind='payroll' and r.date_from>=p_from and r.date_to<=p_to),'[]'::jsonb));
end;
$$;
revoke all on function public.dmp_cost_study_sources(date,date) from public,anon;
grant execute on function public.dmp_cost_study_sources(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
