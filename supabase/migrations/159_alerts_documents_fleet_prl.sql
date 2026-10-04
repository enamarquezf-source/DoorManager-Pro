-- Avisos coherentes, documentacion privada y registros de flota/PRL.
begin;
create or replace function public.dmp_update_alert_recipient(p_recipient_id uuid,p_action text)
returns public.alert_recipients language plpgsql security definer set search_path=public as $$
declare a public.profiles := public.dmp024_active_profile(); r public.alert_recipients;
begin
 if p_action not in ('read','close','reopen') or p_action is null then raise exception 'validacion del formulario: accion de aviso no valida'; end if;
 select * into r from public.alert_recipients where id=p_recipient_id and company_id=a.company_id for update;
 if r.id is null or not exists (select 1 from public.alerts t where t.id=r.alert_id and t.company_id=a.company_id and t.deleted_at is null)
  or not (public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) or r.recipient_profile_id=a.id
   or (r.recipient_profile_id is null and r.recipient_role is not null and public.has_any_role(array[r.recipient_role]))) then
  raise exception 'permiso: aviso no disponible para este usuario';
 end if;
 update public.alert_recipients set
  is_read=case when p_action in ('read','close') then true else is_read end,
  read_at=case when p_action in ('read','close') then coalesce(read_at,now()) else read_at end,
  closed_at=case when p_action='close' then coalesce(closed_at,now()) when p_action='reopen' then null else closed_at end
 where id=r.id returning * into r;
 return r;
end $$;
revoke all on function public.dmp_update_alert_recipient(uuid,text) from public,anon;
grant execute on function public.dmp_update_alert_recipient(uuid,text) to authenticated;
create or replace function public.mark_alert_as_read(p_alert_recipient_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_profile_id is distinct from public.current_profile_id() then raise exception 'permiso: perfil no valido'; end if;
 perform public.dmp_update_alert_recipient(p_alert_recipient_id,'read');
end $$;

create table if not exists public.vehicles (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 registration text not null, name text not null, responsible_profile_id uuid references public.profiles(id),
 inspection_due date, insurance_due date, notes text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,registration), check(length(trim(registration))>0), check(length(trim(name))>0)
);
create table if not exists public.personnel_certificates (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 profile_id uuid not null references public.profiles(id), title text not null,
 kind text not null check(kind in ('Formacion','Certificado','Entrega EPI','Otra documentacion')),
 issued_on date, expires_on date, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(length(trim(title))>0), check(issued_on is null or expires_on is null or expires_on>=issued_on)
);
alter table public.vehicles enable row level security;
alter table public.personnel_certificates enable row level security;
grant select on public.vehicles, public.personnel_certificates to authenticated;
revoke insert,update,delete on public.vehicles,public.personnel_certificates from authenticated,anon;
drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles for select to authenticated using(company_id=public.current_company_id() and public.has_permission('documents.read'));
drop policy if exists personnel_certificates_read on public.personnel_certificates;
create policy personnel_certificates_read on public.personnel_certificates for select to authenticated using(company_id=public.current_company_id()
 and public.has_permission('documents.read') and (profile_id=public.current_profile_id() or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia'])));
create or replace function public.dmp_save_operational_register(p_kind text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); target uuid:=nullif(p_payload->>'id','')::uuid; person uuid;
 old_data jsonb; new_data jsonb; table_name text;
begin
 if p_kind not in ('vehicle','prl') or p_kind is null then raise exception 'validacion del formulario: tipo de registro no valido'; end if;
 if not public.has_permission(case when target is null then 'documents.create' else 'documents.update' end)
  or not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: no puedes gestionar flota o PRL'; end if;
 person:=nullif(p_payload->>case when p_kind='vehicle' then 'responsible_profile_id' else 'profile_id' end,'')::uuid;
 if person is not null and not exists(select 1 from public.profiles where id=person and company_id=a.company_id and active and deleted_at is null) then
  raise exception 'empresa: trabajador no valido para esta empresa'; end if;
 if p_kind='vehicle' then
  table_name:='vehicles';
  if target is not null then
   select to_jsonb(v) into old_data from public.vehicles v where v.id=target and v.company_id=a.company_id for update;
   if not found then raise exception 'permiso: vehiculo no disponible'; end if;
  end if;
  insert into public.vehicles(id,company_id,registration,name,responsible_profile_id,inspection_due,insurance_due,notes,active)
  values(coalesce(target,gen_random_uuid()),a.company_id,upper(trim(p_payload->>'registration')),trim(p_payload->>'name'),person,
   nullif(p_payload->>'inspection_due','')::date,nullif(p_payload->>'insurance_due','')::date,nullif(p_payload->>'notes',''),coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set registration=excluded.registration,name=excluded.name,responsible_profile_id=excluded.responsible_profile_id,
   inspection_due=excluded.inspection_due,insurance_due=excluded.insurance_due,notes=excluded.notes,active=excluded.active,updated_at=now()
  returning id,to_jsonb(vehicles.*) into target,new_data;
 else
  table_name:='personnel_certificates';
  if person is null then raise exception 'validacion del formulario: selecciona trabajador'; end if;
  if target is not null then
   select to_jsonb(c) into old_data from public.personnel_certificates c where c.id=target and c.company_id=a.company_id for update;
   if not found then raise exception 'permiso: registro PRL no disponible'; end if;
  end if;
  insert into public.personnel_certificates(id,company_id,profile_id,title,kind,issued_on,expires_on,notes)
  values(coalesce(target,gen_random_uuid()),a.company_id,person,trim(p_payload->>'title'),p_payload->>'kind',
   nullif(p_payload->>'issued_on','')::date,nullif(p_payload->>'expires_on','')::date,nullif(p_payload->>'notes',''))
  on conflict(id) do update set profile_id=excluded.profile_id,title=excluded.title,kind=excluded.kind,
   issued_on=excluded.issued_on,expires_on=excluded.expires_on,notes=excluded.notes,updated_at=now()
  returning id,to_jsonb(personnel_certificates.*) into target,new_data;
 end if;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(a.company_id,table_name,target,case when old_data is null then 'INSERT' else 'UPDATE' end,a.id,old_data,new_data);
 return target;
end $$;
revoke all on function public.dmp_save_operational_register(text,jsonb) from public,anon;
grant execute on function public.dmp_save_operational_register(text,jsonb) to authenticated;

alter table public.documents add column if not exists category text not null default 'Tecnica';
alter table public.documents add column if not exists expires_on date;
alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check check(category in ('Tecnica','General','Vehiculos','PRL'));
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check(type in (
 'Manual de instalacion','Manual de mantenimiento','Manual de motor','Manual de cuadro','Esquema electrico','Despiece','Declaracion CE',
 'Instrucciones de desbloqueo','Procedimiento interno','Ficha tecnica','Factura proveedor','Seguro','ITV','Formacion PRL','Certificado PRL','Otro documento'));
alter table public.document_links drop constraint if exists document_links_related_type_check;
alter table public.document_links add constraint document_links_related_type_check check(related_type in (
 'Cliente','Centro','Equipo','Tipo de equipo','Marca','Modelo','Motor','Cuadro','Expediente','Parte','Check','Factura proveedor','Vehiculo','Registro PRL','Trabajador'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dmp-documents','dmp-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']::text[]) on conflict(id) do nothing;
create or replace function public.dmp_document_path_access(p_name text,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and public.has_permission('documents.read')
 and split_part(p_name,'/',1)=public.current_company_id()::text and array_length(string_to_array(p_name,'/'),1)=3
 and (case when p_write then public.has_permission('documents.create') else exists(
  select 1 from public.documents d join public.files f on f.id=d.file_id and f.company_id=d.company_id
  where d.company_id=public.current_company_id() and d.deleted_at is null and f.bucket='dmp-documents' and f.path=p_name
   and (d.category<>'PRL' or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) or exists(
    select 1 from public.document_links l where l.document_id=d.id and l.company_id=d.company_id
     and l.related_type='Trabajador' and l.related_id=public.current_profile_id()))
 ) end);
$$;
revoke all on function public.dmp_document_path_access(text,boolean) from public,anon;
grant execute on function public.dmp_document_path_access(text,boolean) to authenticated;
drop policy if exists dmp_documents_read on storage.objects;
create policy dmp_documents_read on storage.objects for select to authenticated using(bucket_id='dmp-documents' and public.dmp_document_path_access(name,false));
drop policy if exists dmp_documents_upload on storage.objects;
create policy dmp_documents_upload on storage.objects for insert to authenticated with check(bucket_id='dmp-documents' and owner=auth.uid() and public.dmp_document_path_access(name,true));

create or replace function public.dmp_save_document(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); target uuid:=nullif(p_payload->>'id','')::uuid;
 v_path text:=nullif(p_payload->>'path',''); v_file_id uuid; metadata jsonb; old_data jsonb;
 related_kind text:=nullif(p_payload->>'related_type',''); v_related_id uuid:=nullif(p_payload->>'related_id','')::uuid;
 category text:=coalesce(nullif(p_payload->>'category',''),'Tecnica');
begin
 if not public.has_permission(case when target is null then 'documents.create' else 'documents.update' end) then raise exception 'permiso: no puedes guardar documentos'; end if;
 if nullif(trim(p_payload->>'title'),'') is null then raise exception 'validacion del formulario: falta titulo del documento'; end if;
 if related_kind is not null then
  if related_kind='Vehiculo' then
   if not exists(select 1 from public.vehicles where id=v_related_id and company_id=a.company_id) then raise exception 'empresa: vehiculo no valido'; end if;
   category:='Vehiculos';
  elsif related_kind='Registro PRL' then
   if not exists(select 1 from public.personnel_certificates where id=v_related_id and company_id=a.company_id) or not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: registro PRL no valido'; end if;
   category:='PRL';
  else raise exception 'validacion del formulario: vinculo documental no valido'; end if;
 end if;
 if category='PRL' and not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: documentacion PRL restringida'; end if;
 if target is not null then
  select to_jsonb(d),d.file_id into old_data,v_file_id from public.documents d where d.id=target and d.company_id=a.company_id and d.deleted_at is null for update;
  if not found then raise exception 'permiso: documento no disponible'; end if;
  if old_data->>'category'='PRL' and not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: documentacion PRL restringida'; end if;
 end if;
 if v_path is not null then
  if not public.dmp_document_path_access(v_path,true) then raise exception 'permiso: ruta de archivo no valida'; end if;
  select o.metadata into metadata from storage.objects o where o.bucket_id='dmp-documents' and o.name=v_path and o.owner=auth.uid();
  if not found or coalesce(metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png','image/webp')
   or coalesce((metadata->>'size')::bigint,0)<=0 or (metadata->>'size')::bigint>10485760 then raise exception 'validacion del formulario: archivo no valido, maximo 10 MB'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_path,159));
  select d.id into target from public.documents d join public.files f on f.id=d.file_id where f.company_id=a.company_id and f.bucket='dmp-documents' and f.path=v_path;
  if found then return target; end if;
  target:=nullif(p_payload->>'id','')::uuid;
  insert into public.files(company_id,bucket,path,name,mime_type,size_bytes,uploaded_by)
  values(a.company_id,'dmp-documents',v_path,left(p_payload->>'filename',255),metadata->>'mimetype',(metadata->>'size')::bigint,a.id) returning id into v_file_id;
 end if;
 if v_file_id is null and nullif(trim(p_payload->>'url'),'') is null then raise exception 'validacion del formulario: adjunta un archivo o indica una URL'; end if;
 if nullif(trim(p_payload->>'url'),'') is not null and trim(p_payload->>'url') !~ '^https?://' then raise exception 'validacion del formulario: la URL debe comenzar por https:// o http://'; end if;
 insert into public.documents(id,company_id,title,type,category,expires_on,version,document_date,origin,file_id,url,observations)
 values(coalesce(target,gen_random_uuid()),a.company_id,trim(p_payload->>'title'),p_payload->>'type',category,nullif(p_payload->>'expires_on','')::date,
  nullif(p_payload->>'version',''),nullif(p_payload->>'document_date','')::date,nullif(p_payload->>'origin',''),v_file_id,nullif(trim(p_payload->>'url'),''),nullif(p_payload->>'observations',''))
 on conflict(id) do update set title=excluded.title,type=excluded.type,category=excluded.category,expires_on=excluded.expires_on,version=excluded.version,
  document_date=excluded.document_date,origin=excluded.origin,file_id=excluded.file_id,url=excluded.url,observations=excluded.observations,updated_at=now()
 returning id into target;
 if related_kind is not null then
  if not exists(select 1 from public.document_links where document_id=target and related_type=related_kind and document_links.related_id=v_related_id) then
   insert into public.document_links(company_id,document_id,related_type,related_id) values(a.company_id,target,related_kind,v_related_id);
  end if;
  if related_kind='Registro PRL' then
   insert into public.document_links(company_id,document_id,related_type,related_id)
   select a.company_id,target,'Trabajador',c.profile_id from public.personnel_certificates c where c.id=v_related_id and c.company_id=a.company_id
    and not exists(select 1 from public.document_links l where l.document_id=target and l.related_type='Trabajador' and l.related_id=c.profile_id);
  end if;
 end if;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(a.company_id,'documents',target,case when old_data is null then 'INSERT' else 'UPDATE' end,a.id,old_data,jsonb_build_object('category',category,'file_id',v_file_id));
 return target;
end $$;
revoke all on function public.dmp_save_document(jsonb) from public,anon;
grant execute on function public.dmp_save_document(jsonb) to authenticated;
drop policy if exists documents_prl_scope on public.documents;
create policy documents_prl_scope on public.documents as restrictive for select to authenticated using(
 category<>'PRL' or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) or exists(
  select 1 from public.document_links l where l.document_id=documents.id and l.company_id=documents.company_id
   and l.related_type='Trabajador' and l.related_id=public.current_profile_id()));
drop policy if exists documents_prl_write_scope on public.documents;
create policy documents_prl_write_scope on public.documents as restrictive for update to authenticated
 using(category<>'PRL' or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']))
 with check(category<>'PRL' or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']));
drop policy if exists documents_prl_insert_scope on public.documents;
create policy documents_prl_insert_scope on public.documents as restrictive for insert to authenticated
 with check(category<>'PRL' or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']));
commit;

