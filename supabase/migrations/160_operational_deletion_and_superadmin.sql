-- Eliminacion auditada y acceso completo a los nuevos modulos.
begin;
insert into public.permissions(code,description) values
 ('alerts.delete','Eliminar avisos'),('vehicles.delete','Eliminar vehiculos'),('documents.delete','Eliminar documentos')
on conflict(code) do update set description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name in ('superadmin','SAT','Oficina','Gerencia') and p.code in ('alerts.delete','vehicles.delete','documents.delete')
on conflict do nothing;
alter table public.vehicles add column if not exists deleted_at timestamptz;
alter table public.personnel_certificates add column if not exists deleted_at timestamptz;

create or replace function public.dmp_delete_operational_record(p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_actor public.profiles:=public.dmp024_active_profile(); v_table text; v_permission text;
 v_old jsonb; v_new jsonb; v_company uuid;
begin
 case p_kind when 'alert' then v_table:='alerts'; v_permission:='alerts.delete';
 when 'vehicle' then v_table:='vehicles'; v_permission:='vehicles.delete';
 when 'document' then v_table:='documents'; v_permission:='documents.delete';
 else raise exception 'validacion del formulario: tipo de registro no valido'; end case;
 if not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) or not public.has_permission(v_permission) then
  raise exception 'permiso: no puedes eliminar este registro'; end if;
 execute format('select to_jsonb(t),t.company_id from public.%I t where t.id=$1 and (t.company_id=$2 or public.is_platform_superadmin()) for update',v_table)
 into v_old,v_company using p_id,v_actor.company_id;
 if v_old is null then raise exception 'permiso: registro no disponible'; end if;
 if v_old->>'deleted_at' is not null then return; end if;
 execute format('update public.%I t set deleted_at=now(),updated_at=now() where t.id=$1 returning to_jsonb(t)',v_table) into v_new using p_id;
 if p_kind='vehicle' then update public.vehicles set active=false where id=p_id; v_new:=jsonb_set(v_new,'{active}','false'::jsonb); end if;
 if p_kind='alert' then
  update public.alert_recipients set is_read=true,read_at=coalesce(read_at,now()),closed_at=coalesce(closed_at,now()) where alert_id=p_id and company_id=v_company;
 end if;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(v_company,v_table,p_id,'UPDATE',v_actor.id,v_old,v_new);
end $$;
revoke all on function public.dmp_delete_operational_record(text,uuid) from public,anon;
grant execute on function public.dmp_delete_operational_record(text,uuid) to authenticated;

-- Superadmin de plataforma puede leer todas las empresas. El resto conserva su ambito.
drop policy if exists vehicles_read on public.vehicles;
create policy vehicles_read on public.vehicles for select to authenticated using(deleted_at is null and
 (public.is_platform_superadmin() or (company_id=public.current_company_id() and public.has_permission('documents.read'))));
drop policy if exists personnel_certificates_read on public.personnel_certificates;
create policy personnel_certificates_read on public.personnel_certificates for select to authenticated using(deleted_at is null and
 (public.is_platform_superadmin() or (company_id=public.current_company_id() and public.has_permission('documents.read')
 and (profile_id=public.current_profile_id() or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia'])))));
drop policy if exists alerts_platform_read on public.alerts;
create policy alerts_platform_read on public.alerts for select to authenticated using(public.is_platform_superadmin() and deleted_at is null);
drop policy if exists alert_recipients_platform_read on public.alert_recipients;
create policy alert_recipients_platform_read on public.alert_recipients for select to authenticated using(public.is_platform_superadmin());
drop policy if exists documents_platform_read on public.documents;
create policy documents_platform_read on public.documents for select to authenticated using(public.is_platform_superadmin() and deleted_at is null);
drop policy if exists document_links_platform_read on public.document_links;
create policy document_links_platform_read on public.document_links for select to authenticated using(public.is_platform_superadmin());
drop policy if exists files_platform_read on public.files;
create policy files_platform_read on public.files for select to authenticated using(public.is_platform_superadmin());
create or replace function public.dmp_update_alert_recipient(p_recipient_id uuid,p_action text)
returns public.alert_recipients language plpgsql security definer set search_path=public as $$
declare a public.profiles := public.dmp024_active_profile(); r public.alert_recipients;
begin
 if p_action not in ('read','close','reopen') or p_action is null then raise exception 'validacion del formulario: accion de aviso no valida'; end if;
 select * into r from public.alert_recipients where id=p_recipient_id and (company_id=a.company_id or public.is_platform_superadmin()) for update;
 if r.id is null or not exists (select 1 from public.alerts t where t.id=r.alert_id and t.company_id=r.company_id and t.deleted_at is null)
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

create or replace function public.dmp_save_operational_register(p_kind text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.profiles:=public.dmp024_active_profile(); target uuid:=nullif(p_payload->>'id','')::uuid; person uuid;
 old_data jsonb; new_data jsonb; table_name text; v_company uuid:=a.company_id;
begin
 if p_kind not in ('vehicle','prl') or p_kind is null then raise exception 'validacion del formulario: tipo de registro no valido'; end if;
 if not public.has_permission(case when target is null then 'documents.create' else 'documents.update' end)
  or not public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) then raise exception 'permiso: no puedes gestionar flota o PRL'; end if;
 if target is not null and public.is_platform_superadmin() then
  if p_kind='vehicle' then select v.company_id into v_company from public.vehicles v where v.id=target and v.deleted_at is null;
  else select c.company_id into v_company from public.personnel_certificates c where c.id=target and c.deleted_at is null; end if;
  if not found then raise exception 'permiso: registro no disponible'; end if;
 end if;
 person:=nullif(p_payload->>case when p_kind='vehicle' then 'responsible_profile_id' else 'profile_id' end,'')::uuid;
 if person is not null and not exists(select 1 from public.profiles where id=person and company_id=v_company and active and deleted_at is null) then
  raise exception 'empresa: trabajador no valido para esta empresa'; end if;
 if p_kind='vehicle' then
  table_name:='vehicles';
  if target is not null then
   select to_jsonb(v) into old_data from public.vehicles v where v.id=target and v.company_id=v_company and v.deleted_at is null for update;
   if not found then raise exception 'permiso: vehiculo no disponible'; end if;
  end if;
  insert into public.vehicles(id,company_id,registration,name,responsible_profile_id,inspection_due,insurance_due,notes,active)
  values(coalesce(target,gen_random_uuid()),v_company,upper(trim(p_payload->>'registration')),trim(p_payload->>'name'),person,
   nullif(p_payload->>'inspection_due','')::date,nullif(p_payload->>'insurance_due','')::date,nullif(p_payload->>'notes',''),coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set registration=excluded.registration,name=excluded.name,responsible_profile_id=excluded.responsible_profile_id,
   inspection_due=excluded.inspection_due,insurance_due=excluded.insurance_due,notes=excluded.notes,active=excluded.active,updated_at=now()
  returning id,to_jsonb(vehicles.*) into target,new_data;
 else
  table_name:='personnel_certificates';
  if person is null then raise exception 'validacion del formulario: selecciona trabajador'; end if;
  if target is not null then
   select to_jsonb(c) into old_data from public.personnel_certificates c where c.id=target and c.company_id=v_company and c.deleted_at is null for update;
   if not found then raise exception 'permiso: registro PRL no disponible'; end if;
  end if;
  insert into public.personnel_certificates(id,company_id,profile_id,title,kind,issued_on,expires_on,notes)
  values(coalesce(target,gen_random_uuid()),v_company,person,trim(p_payload->>'title'),p_payload->>'kind',
   nullif(p_payload->>'issued_on','')::date,nullif(p_payload->>'expires_on','')::date,nullif(p_payload->>'notes',''))
  on conflict(id) do update set profile_id=excluded.profile_id,title=excluded.title,kind=excluded.kind,
   issued_on=excluded.issued_on,expires_on=excluded.expires_on,notes=excluded.notes,updated_at=now()
  returning id,to_jsonb(personnel_certificates.*) into target,new_data;
 end if;
 insert into public.audit_log(company_id,table_name,record_id,operation,changed_by,old_data,new_data)
 values(v_company,table_name,target,case when old_data is null then 'INSERT' else 'UPDATE' end,a.id,old_data,new_data);
 return target;
end $$;
revoke all on function public.dmp_save_operational_register(text,jsonb) from public,anon;
grant execute on function public.dmp_save_operational_register(text,jsonb) to authenticated;

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
  if related_kind='Vehiculo' then
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

create or replace function public.dmp_document_path_access(p_name text,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and public.has_permission('documents.read')
 and (split_part(p_name,'/',1)=public.current_company_id()::text or public.is_platform_superadmin()) and array_length(string_to_array(p_name,'/'),1)=3
 and (case when p_write then public.has_permission('documents.create') else exists(
  select 1 from public.documents d join public.files f on f.id=d.file_id and f.company_id=d.company_id
  where (d.company_id=public.current_company_id() or public.is_platform_superadmin()) and d.deleted_at is null and f.bucket='dmp-documents' and f.path=p_name
   and (d.category<>'PRL' or public.has_any_role(array['superadmin','SAT','Oficina','Gerencia']) or exists(
    select 1 from public.document_links l where l.document_id=d.id and l.company_id=d.company_id
     and l.related_type='Trabajador' and l.related_id=public.current_profile_id()))
 ) end);
$$;
revoke all on function public.dmp_document_path_access(text,boolean) from public,anon;
grant execute on function public.dmp_document_path_access(text,boolean) to authenticated;

commit;
