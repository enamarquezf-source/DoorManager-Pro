-- Admite documentos vinculados a un equipo activo de la misma empresa.
begin;

create or replace function public.dmp_save_document(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); target uuid:=nullif(p_payload->>'id','')::uuid;
 v_path text:=nullif(p_payload->>'path',''); v_file_id uuid; metadata jsonb; old_data jsonb;
 related_kind text:=nullif(p_payload->>'related_type',''); v_related_id uuid:=nullif(p_payload->>'related_id','')::uuid;
 v_company uuid:=a.company_id;
 category text:=coalesce(nullif(p_payload->>'category',''),'Tecnica');
begin
 if not public.has_permission(case when target is null then 'documents.create' else 'documents.update' end) then raise exception 'permiso: no puedes guardar documentos'; end if;
 if nullif(trim(p_payload->>'title'),'') is null then raise exception 'validacion del formulario: falta titulo del documento'; end if;
 if public.is_platform_superadmin() then
  if target is not null then select d.company_id into v_company from public.documents d where d.id=target and d.deleted_at is null;
  elsif related_kind='Vehiculo' then select v.company_id into v_company from public.vehicles v where v.id=v_related_id and v.deleted_at is null;
  elsif related_kind='Registro PRL' then select c.company_id into v_company from public.personnel_certificates c where c.id=v_related_id and c.deleted_at is null;
  end if;
  if v_company is null then raise exception 'permiso: registro no disponible'; end if;
 end if;
 if related_kind is not null then
  if related_kind='Equipo' then
   if not exists(select 1 from public.equipment where id=v_related_id and company_id=v_company and deleted_at is null) then
    raise exception 'empresa: equipo no disponible';
   end if;
   category:='Tecnica';
  elsif related_kind='Vehiculo' then
   if not exists(select 1 from public.vehicles where id=v_related_id and company_id=v_company) then raise exception 'empresa: vehiculo no valido'; end if;
   category:='Vehiculos';
  elsif related_kind='Registro PRL' then
   if not exists(select 1 from public.personnel_certificates where id=v_related_id and company_id=v_company) or not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: registro PRL no valido'; end if;
   category:='PRL';
  else raise exception 'validacion del formulario: vinculo documental no valido'; end if;
 end if;
 if category='PRL' and not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: documentacion PRL restringida'; end if;
 if target is not null then
  select to_jsonb(d),d.file_id into old_data,v_file_id from public.documents d where d.id=target and d.company_id=v_company and d.deleted_at is null for update;
  if not found then raise exception 'permiso: documento no disponible'; end if;
  if old_data->>'category'='PRL' and not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: documentacion PRL restringida'; end if;
 end if;
 if v_path is not null then
  if not public.dmp_document_path_access(v_path,true) then raise exception 'permiso: ruta de archivo no valida'; end if;
  select o.metadata into metadata from storage.objects o where o.bucket_id='dmp-documents' and o.name=v_path and o.owner=auth.uid();
  if not found or coalesce(metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png','image/webp')
   or coalesce((metadata->>'size')::bigint,0)<=0 or (metadata->>'size')::bigint>10485760 then raise exception 'validacion del formulario: archivo no valido, maximo 10 MB'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_path,159));
  select d.id into target from public.documents d join public.files f on f.id=d.file_id where f.company_id=v_company and f.bucket='dmp-documents' and f.path=v_path;
  if found then return target; end if;
  target:=nullif(p_payload->>'id','')::uuid;
  insert into public.files(company_id,bucket,path,name,mime_type,size_bytes,uploaded_by)
  values(v_company,'dmp-documents',v_path,left(p_payload->>'filename',255),metadata->>'mimetype',(metadata->>'size')::bigint,a.id) returning id into v_file_id;
 end if;
 if v_file_id is null and nullif(trim(p_payload->>'url'),'') is null then raise exception 'validacion del formulario: adjunta un archivo o indica una URL'; end if;
 if nullif(trim(p_payload->>'url'),'') is not null and trim(p_payload->>'url') !~ '^https?://' then raise exception 'validacion del formulario: la URL debe comenzar por https:// o http://'; end if;
 insert into public.documents(id,company_id,title,type,category,expires_on,version,document_date,origin,file_id,url,observations)
 values(coalesce(target,gen_random_uuid()),v_company,trim(p_payload->>'title'),p_payload->>'type',category,nullif(p_payload->>'expires_on','')::date,
  nullif(p_payload->>'version',''),nullif(p_payload->>'document_date','')::date,nullif(p_payload->>'origin',''),v_file_id,nullif(trim(p_payload->>'url'),''),nullif(p_payload->>'observations',''))
 on conflict(id) do update set title=excluded.title,type=excluded.type,category=excluded.category,expires_on=excluded.expires_on,version=excluded.version,
  document_date=excluded.document_date,origin=excluded.origin,file_id=excluded.file_id,url=excluded.url,observations=excluded.observations,updated_at=now()
 returning id into target;
 if related_kind is not null then
  if not exists(select 1 from public.document_links where document_id=target and related_type=related_kind and document_links.related_id=v_related_id) then
   insert into public.document_links(company_id,document_id,related_type,related_id) values(v_company,target,related_kind,v_related_id);
  end if;
  if related_kind='Registro PRL' then
   insert into public.document_links(company_id,document_id,related_type,related_id)
   select v_company,target,'Trabajador',c.profile_id from public.personnel_certificates c where c.id=v_related_id and c.company_id=v_company
    and not exists(select 1 from public.document_links l where l.document_id=target and l.related_type='Trabajador' and l.related_id=c.profile_id);
  end if;
 end if;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(v_company,'documents',target,case when old_data is null then 'INSERT' else 'UPDATE' end,a.id,old_data,jsonb_build_object('category',category,'file_id',v_file_id));
 return target;
end $$;
revoke all on function public.dmp_save_document(jsonb) from public,anon;
grant execute on function public.dmp_save_document(jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
