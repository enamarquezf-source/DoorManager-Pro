-- Only after 001-empty-schema.sql in the NEW demo project. Never a production migration.
begin;
do $$ begin
  if exists(select 1 from public.companies) or exists(select 1 from public.profiles)
     or exists(select 1 from auth.users where not coalesce(is_anonymous,false)) then
    raise exception 'Demo: se necesita una instalación vacía y sin cuentas permanentes';
  end if;
end $$;

create table public.dmp_demo_config (
  id boolean primary key default true check(id), enabled boolean not null default false,
  max_sessions integer not null default 20 check(max_sessions between 1 and 100)
);
insert into public.dmp_demo_config default values;
create table public.dmp_demo_sessions (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique,
  company_id uuid not null unique, profile_id uuid not null unique,
  role_name text not null check(role_name in ('Gerencia','Oficina','SAT','Comercial','Tecnico')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
  absolute_expires_at timestamptz not null default now()+interval '2 hours', ended_at timestamptz,
  work_order_id uuid, cleanup_state text not null default 'pending'
    check(cleanup_state in ('pending','database_done','complete')),
  file_manifest jsonb not null default '[]', cleanup_error text, completed_at timestamptz
);
alter table public.dmp_demo_config enable row level security;
alter table public.dmp_demo_sessions enable row level security;
revoke all on public.dmp_demo_config,public.dmp_demo_sessions from public,anon,authenticated;
grant all on public.dmp_demo_config,public.dmp_demo_sessions to service_role;

create or replace function public.current_company_id() returns uuid language sql stable security definer set search_path=public as $$
 select s.company_id from public.dmp_demo_sessions s where s.auth_user_id=auth.uid()
 and s.ended_at is null and s.expires_at>now() and s.absolute_expires_at>now()
$$;
create or replace function public.current_profile_id() returns uuid language sql stable security definer set search_path=public as $$
 select p.id from public.profiles p join public.dmp_demo_sessions s on s.profile_id=p.id
 where s.auth_user_id=auth.uid() and s.ended_at is null and s.expires_at>now() and s.absolute_expires_at>now()
 and p.active and p.deleted_at is null
$$;
create or replace function public.dmp_operating_company_id() returns uuid language sql stable security definer set search_path=public as $$select public.current_company_id()$$;
create or replace function public.is_platform_superadmin() returns boolean language sql stable security definer set search_path=public as $$select false$$;
create or replace function public.is_company_member(p_company_id uuid) returns boolean language sql stable security definer set search_path=public as $$select coalesce(p_company_id=public.current_company_id(),false)$$;

create function public.dmp_demo_status() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('ready',c.enabled,'version',1) from public.dmp_demo_config c where c.id
$$;
create function public.dmp_demo_session() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',s.id,'company_id',s.company_id,'profile_id',s.profile_id,'role',s.role_name,
 'expires_at',least(s.expires_at,s.absolute_expires_at),'ended',s.ended_at is not null or s.expires_at<=now() or s.absolute_expires_at<=now(),
 'cleanup_state',s.cleanup_state,'work_order_id',s.work_order_id)
 from public.dmp_demo_sessions s where s.auth_user_id=auth.uid()
$$;
create function public.dmp_demo_heartbeat() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 update public.dmp_demo_sessions set expires_at=least(now()+interval '30 minutes',absolute_expires_at)
 where auth_user_id=auth.uid() and ended_at is null and expires_at>now() and absolute_expires_at>now();
 return public.dmp_demo_session();
end $$;

create function public.dmp_demo_start(p_role text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); config public.dmp_demo_config; existing public.dmp_demo_sessions;
begin
 if p_role is null or p_role not in ('Gerencia','Oficina','SAT','Comercial','Tecnico') then raise exception 'Demo: rol no válido'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and is_anonymous=true) then raise exception 'Demo: se necesita una identidad anónima'; end if;
 select * into config from public.dmp_demo_config where id for update;
 if not config.enabled then raise exception 'Demo: acceso público pendiente de activación'; end if;
 select * into existing from public.dmp_demo_sessions where auth_user_id=auth.uid();
 if found then
   if existing.role_name<>p_role or existing.ended_at is not null or existing.expires_at<=now() or existing.absolute_expires_at<=now() then
     raise exception 'Demo: termina esta sesión antes de empezar otra';
   end if;
   return public.dmp_demo_session();
 end if;
 if (select count(*) from public.dmp_demo_sessions where cleanup_state<>'complete')>=config.max_sessions then
   raise exception 'Demo: todas las plazas están ocupadas; vuelve a intentarlo en unos minutos';
 end if;
 insert into public.dmp_demo_sessions(auth_user_id,company_id,profile_id,role_name) values(auth.uid(),c,p,p_role);
 insert into public.companies(id,name) values(c,'Empresa de prueba '||c::text);
 insert into public.profiles(id,company_id,auth_user_id,first_name,last_name,email,primary_area)
 values(p,c,auth.uid(),'Visitante','Demo','visitante-'||p::text||'@example.invalid',p_role);
 insert into public.profile_roles(profile_id,role_id) select p,id from public.roles where name=p_role;
 if p_role='Tecnico' then perform public.dmp_demo_seed_technician(c,p); end if;
 return public.dmp_demo_session();
end $$;

create function public.dmp_demo_seed_technician(c uuid,p uuid) returns void language plpgsql security definer set search_path=public as $$
declare client uuid; site uuid; work uuid; equipment uuid; equipment_type uuid; template uuid; section uuid;
 shape jsonb; section_data jsonb; label text; position integer; item_position integer;
begin
 insert into public.clients(company_id,code,legal_name,notes) values(c,'CLI-DEMO','Cliente ficticio · Demo','Escenario ficticio, sin datos reales') returning id into client;
 insert into public.sites(company_id,client_id,code,name,address) values(c,client,'CEN-DEMO','Centro de prueba','Ubicación ficticia · no desplazarse') returning id into site;
 insert into public.work_orders(company_id,code,client_id,site_id,title,description,type,origin,created_by,created_role,main_technician_id,current_responsible_id,scheduled_date,billable)
 values(c,'PAR-DEMO',client,site,'Tu primera revisión · tres equipos','Prueba los checks de cada equipo. Puedes marcar componentes favorables o con defecto, explicar el problema y añadir fotos ficticias.','Mantenimiento','Gerencia',p,'Tecnico',p,p,(now() at time zone 'Europe/Madrid')::date,false) returning id into work;
 insert into public.work_order_assignments(company_id,work_order_id,technician_id,assignment_date,assigned_by)
 values(c,work,p,(now() at time zone 'Europe/Madrid')::date,p);
 for shape in select value from jsonb_array_elements('[
   {"type":"Puerta seccional","sections":[{"title":"Hoja y guiado","items":["Paneles","Bisagras","Rodillos y guías"]},{"title":"Accionamiento","items":["Motor","Muelles y cables","Cuadro de maniobras"]},{"title":"Seguridad","items":["Fotocélulas","Banda de seguridad","Desbloqueo manual"]}]},
   {"type":"Puerta corredera","sections":[{"title":"Estructura","items":["Hoja","Carril y ruedas","Topes"]},{"title":"Accionamiento","items":["Motor","Cremallera","Finales de carrera"]},{"title":"Seguridad","items":["Fotocélulas","Banda de seguridad","Desbloqueo manual"]}]},
   {"type":"Barrera automática","sections":[{"title":"Armario","items":["Carcasa y anclajes","Motor","Cuadro de maniobras"]},{"title":"Asta","items":["Asta y fijaciones","Sistema de contrapeso"]},{"title":"Seguridad","items":["Fotocélulas","Detección de obstáculos","Desbloqueo manual"]}]}
 ]'::jsonb) loop
   insert into public.equipment_types(company_id,name,description) values(c,shape->>'type','Tipo ficticio para demostración') returning id into equipment_type;
   insert into public.check_templates(company_id,equipment_type_id,name,version) values(c,equipment_type,'Revisión de prueba · '||(shape->>'type'),'DEMO-1') returning id into template;
   position:=0;
   for section_data in select value from jsonb_array_elements(shape->'sections') loop
     position:=position+1;
     insert into public.check_template_sections(template_id,title,position) values(template,section_data->>'title',position) returning id into section;
     item_position:=0;
     for label in select jsonb_array_elements_text(section_data->'items') loop
       item_position:=item_position+1;
       insert into public.check_template_items(section_id,title,component,position) values(section,'Comprobar estado y funcionamiento',label,item_position);
     end loop;
   end loop;
   insert into public.equipment(company_id,code,client_id,site_id,equipment_type_id,model,internal_location)
   values(c,'EQ-DEMO-'||substr(equipment_type::text,1,8),client,site,equipment_type,'Modelo ficticio',shape->>'type') returning id into equipment;
   insert into public.work_order_equipment(company_id,work_order_id,equipment_id,is_primary) values(c,work,equipment,false);
 end loop;
 if (select count(*) from public.checks where work_order_id=work)<>3 then raise exception 'Demo: no se han preparado los tres checks'; end if;
 update public.dmp_demo_sessions set work_order_id=work where company_id=c;
end $$;

create function public.dmp_demo_finish() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 update public.dmp_demo_sessions set ended_at=coalesce(ended_at,now()) where auth_user_id=auth.uid();
 return public.dmp_demo_session();
end $$;

-- A fresh demo has no permanent operators or platform admin accounts.
-- Enforce expiry and ownership even through older definer business RPCs.
create function public.dmp_demo_guard_row() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid; existing_count bigint;
begin
 if auth.uid() is null then return new; end if;
 target:=case when TG_TABLE_NAME='companies' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'company_id')::uuid end;
 if target is null or target is distinct from public.current_company_id() then raise exception 'Demo: recurso fuera de tu sesión o sesión caducada'; end if;
 if TG_OP='UPDATE' and TG_TABLE_NAME<>'companies' and (to_jsonb(old)->>'company_id') is distinct from (to_jsonb(new)->>'company_id') then raise exception 'Demo: no puedes trasladar registros a otra empresa'; end if;
 if TG_TABLE_NAME='profiles' and (to_jsonb(new)->>'primary_area')='superadmin' then raise exception 'Demo: rol no permitido'; end if;
 if TG_OP='INSERT' and TG_TABLE_NAME<>'companies' then
   execute format('select count(*) from public.%I where company_id=$1',TG_TABLE_NAME) into existing_count using target;
   if existing_count>=200 then raise exception 'Demo: has alcanzado el límite de registros de esta prueba'; end if;
 end if;
 return new;
end $$;
create function public.dmp_demo_guard_role() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is not null and exists(select 1 from public.roles where id=new.role_id and name='superadmin') then
   raise exception 'Demo: rol no permitido';
 end if;
 return new;
end $$;
create trigger dmp_demo_no_superadmin before insert or update on public.profile_roles for each row execute function public.dmp_demo_guard_role();
do $$ declare t record; begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='company_id'
   and table_name not like 'dmp_demo_%' and table_name in(select tablename from pg_tables where schemaname='public') loop
   execute format('create trigger dmp_demo_write_guard before insert or update on public.%I for each row execute function public.dmp_demo_guard_row()',t.table_name);
   execute format('create policy dmp_demo_tenant_guard on public.%I as restrictive for all to authenticated using(company_id=public.current_company_id()) with check(company_id=public.current_company_id())',t.table_name);
 end loop;
 create trigger dmp_demo_write_guard before insert or update on public.companies for each row execute function public.dmp_demo_guard_row();
 create policy dmp_demo_company_guard on public.companies as restrictive for all to authenticated using(id=public.current_company_id()) with check(id=public.current_company_id());
 -- Allow deferred removal of all related rows, including cycles, in one cleanup transaction.
 for t in select conrelid::regclass as tbl,conname from pg_constraint where contype='f' and connamespace='public'::regnamespace loop
   execute format('alter table %s alter constraint %I deferrable initially immediate',t.tbl,t.conname);
 end loop;
end $$;
create policy dmp_demo_storage_guard on storage.objects as restrictive for all to authenticated
 using(split_part(name,'/',1)=public.current_company_id()::text)
 with check(split_part(name,'/',1)=public.current_company_id()::text);

-- Private, retryable purge. Trigger changes and all deletes are transactional.
-- Refuse cross-company child references rather than deleting another visitor's rows.
create function public.dmp_demo_purge(p_session uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.dmp_demo_sessions; t record; f record; inserted bigint; progress bigint; cross_count bigint; join_sql text; manifest jsonb;
begin
 select * into s from public.dmp_demo_sessions where id=p_session for update;
 if s.id is null then raise exception 'Demo: sesión inexistente'; end if;
 if s.ended_at is null and s.expires_at>now() and s.absolute_expires_at>now() then raise exception 'Demo: no se puede borrar una sesión activa'; end if;
 if s.cleanup_state<>'pending' then return to_jsonb(s); end if;
 update public.dmp_demo_sessions set ended_at=coalesce(ended_at,now()) where id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'path',path)),'[]') into manifest from public.files where company_id=s.company_id;
 create temporary table if not exists dmp_demo_delete_targets(tbl oid,row_tid tid,primary key(tbl,row_tid)) on commit drop;
 truncate dmp_demo_delete_targets;
 insert into dmp_demo_delete_targets select tableoid,ctid from public.companies where id=s.company_id;
 for t in select c.table_name from information_schema.columns c join pg_tables p on p.schemaname=c.table_schema and p.tablename=c.table_name
   where c.table_schema='public' and c.column_name='company_id' and c.table_name not like 'dmp_demo_%' loop
   execute format('insert into dmp_demo_delete_targets select tableoid,ctid from public.%I where company_id=$1 on conflict do nothing',t.table_name) using s.company_id;
 end loop;
 loop
   progress:=0;
   for f in select * from pg_constraint where contype='f' and connamespace='public'::regnamespace loop
     select string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ') into join_sql
     from unnest(f.conkey,f.confkey) keys(child_key,parent_key)
     join pg_attribute ca on ca.attrelid=f.conrelid and ca.attnum=keys.child_key
     join pg_attribute pa on pa.attrelid=f.confrelid and pa.attnum=keys.parent_key;
     execute format('insert into dmp_demo_delete_targets select child.tableoid,child.ctid from %s child join %s parent on %s join dmp_demo_delete_targets d on d.tbl=parent.tableoid and d.row_tid=parent.ctid on conflict do nothing',f.conrelid::regclass,f.confrelid::regclass,join_sql);
     get diagnostics inserted=row_count; progress:=progress+inserted;
   end loop;
   exit when progress=0;
 end loop;
 for t in select distinct tbl from dmp_demo_delete_targets loop
   if exists(select 1 from pg_attribute where attrelid=t.tbl and attname='company_id' and not attisdropped) then
     execute format('select count(*) from %s x join dmp_demo_delete_targets d on d.tbl=x.tableoid and d.row_tid=x.ctid where x.company_id is distinct from $1',t.tbl::regclass) into cross_count using s.company_id;
     if cross_count>0 then raise exception 'Demo: referencia cruzada detectada; limpieza cancelada'; end if;
   end if;
   execute format('alter table %s disable trigger user',t.tbl::regclass);
 end loop;
 set constraints all deferred;
 for t in select distinct tbl from dmp_demo_delete_targets loop
   execute format('delete from %s x using dmp_demo_delete_targets d where d.tbl=x.tableoid and d.row_tid=x.ctid',t.tbl::regclass);
 end loop;
 set constraints all immediate;
 for t in select distinct tbl from dmp_demo_delete_targets loop execute format('alter table %s enable trigger user',t.tbl::regclass); end loop;
 update public.dmp_demo_sessions set cleanup_state='database_done',file_manifest=manifest,cleanup_error=null where id=s.id returning * into s;
 return to_jsonb(s);
end $$;

create function public.dmp_demo_cleanup_jobs(p_auth_user_id uuid default null) returns setof public.dmp_demo_sessions language sql security definer set search_path=public as $$
 select s.* from public.dmp_demo_sessions s where s.cleanup_state<>'complete'
 and (p_auth_user_id is null or s.auth_user_id=p_auth_user_id)
 and (s.ended_at is not null or s.expires_at<=now() or s.absolute_expires_at<=now()) order by s.created_at limit 10
$$;
create function public.dmp_demo_orphan_identities() returns table(id uuid) language sql security definer set search_path=public as $$
 select u.id from auth.users u where u.is_anonymous=true and u.created_at<now()-interval '1 hour'
 and not exists(select 1 from public.dmp_demo_sessions s where s.auth_user_id=u.id) order by u.created_at limit 10
$$;
-- Default function EXECUTE belongs to PUBLIC; remove it explicitly for every new routine.
revoke all on function public.dmp_demo_seed_technician(uuid,uuid),public.dmp_demo_guard_row(),public.dmp_demo_guard_role(),public.dmp_demo_purge(uuid),public.dmp_demo_cleanup_jobs(uuid),public.dmp_demo_orphan_identities() from public,anon,authenticated;
grant execute on function public.dmp_demo_purge(uuid),public.dmp_demo_cleanup_jobs(uuid),public.dmp_demo_orphan_identities() to service_role;
revoke all on function public.dmp_demo_status(),public.dmp_demo_session(),public.dmp_demo_start(text),public.dmp_demo_heartbeat(),public.dmp_demo_finish() from public,anon,authenticated;
grant execute on function public.dmp_demo_status() to anon,authenticated;
grant execute on function public.dmp_demo_session(),public.dmp_demo_start(text),public.dmp_demo_heartbeat(),public.dmp_demo_finish() to authenticated;
notify pgrst,'reload schema';
commit;
