import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from 'vitest';
const sql178=readFileSync(new URL('../../supabase/migrations/178_work_intake_equipment_options.sql',import.meta.url),'utf8');
const sql179=readFileSync(new URL('../../supabase/migrations/179_maintenance_contracts_and_visits.sql',import.meta.url),'utf8');
const sql180=readFileSync(new URL('../../supabase/migrations/180_maintenance_contract_code_generation.sql',import.meta.url),'utf8');
const codeSource=readFileSync(new URL('../../supabase/migrations/130_supplier_invoice_core.sql',import.meta.url),'utf8');
const originalCode=codeSource.slice(codeSource.indexOf('create or replace function public.next_dmp_code('),codeSource.indexOf('create table public.supplier_invoices'));
const original=readFileSync(new URL('../../supabase/migrations/115_fix_work_order_creator_auto_assignment.sql',import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',tech='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const client='33333333-3333-4333-8333-333333333333',site='44444444-4444-4444-8444-444444444444',otherClient='55555555-5555-4555-8555-555555555555',otherSite='66666666-6666-4666-8666-666666666666';
const type='77777777-7777-4777-8777-777777777777',equipment='88888888-8888-4888-8888-888888888888';
let db:PGlite;
const ctx=(id=actor)=>db.query("select set_config('test.profile',$1,false)",[id]);
const request=(extra:Record<string,any>={})=>({company_id:A,created_by:actor,created_role:'SAT',client_id:client,site_id:site,type:'Instalacion',title:'Trabajo solicitado',origin:'SAT',client_operation_id:crypto.randomUUID(),equipment_mode:'unknown',equipment_selection:[],...extra});
const contract=(extra:Record<string,any>={})=>({client_id:client,site_id:site,title:'Revisiones del centro',starts_on:'2026-01-31',ends_on:'2026-04-30',first_visit:'2026-01-31',recurrence_months:1,billing_frequency:'monthly',billing_amount:100,status:'active',equipment_mode:'unknown',equipment_selection:[],...extra});
async function create(payload=request()){const result=await db.query<{id:string}>('select public.dmp_create_work_order_full($1::jsonb) id',[JSON.stringify(payload)]);return result.rows[0].id;}
async function saveContract(payload=contract(),id=crypto.randomUUID()){await db.query('select public.dmp_save_maintenance_contract($1,$2::jsonb)',[id,JSON.stringify(payload)]);return id;}
describe('real PostgreSQL execution of work intake and maintenance migrations',()=>{
 beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
   create role authenticated;create role anon;
   create table companies(id uuid primary key,name text);
   create table profiles(id uuid primary key,company_id uuid references companies(id),active boolean default true,deleted_at timestamptz,primary_area text default 'SAT');
   create table roles(id uuid primary key default gen_random_uuid(),name text unique);create table profile_roles(profile_id uuid references profiles(id),role_id uuid references roles(id));
   create table clients(id uuid primary key,company_id uuid references companies(id),deleted_at timestamptz);
   create table sites(id uuid primary key,company_id uuid references companies(id),client_id uuid references clients(id),deleted_at timestamptz);
   create table cases(id uuid primary key,company_id uuid,client_id uuid,site_id uuid,deleted_at timestamptz);
   create table quotes(id uuid primary key,company_id uuid,client_id uuid,site_id uuid,case_id uuid,status text,deleted_at timestamptz);
   create table equipment_types(id uuid primary key default gen_random_uuid(),company_id uuid,name text,description text,active boolean default true,unique(company_id,name));
   create table equipment(id uuid primary key default gen_random_uuid(),company_id uuid,code text,client_id uuid,site_id uuid,equipment_type_id uuid references equipment_types(id),brand text,model text,serial_number text,installation_date date,internal_location text,status text,criticality text,notes text,deleted_at timestamptz);
   create table work_orders(id uuid primary key default gen_random_uuid(),company_id uuid,code text,case_id uuid,quote_id uuid,client_id uuid,site_id uuid,main_equipment_id uuid references equipment(id),title text,description text,type text,priority text,status text default 'Pendiente',origin text,scheduled_date date,scheduled_time time,estimated_duration_minutes integer,contact_id uuid,access_requirement_id uuid,planned_material text,created_by uuid,created_role text,updated_by uuid,current_responsible_id uuid,main_technician_id uuid,deleted_at timestamptz,updated_at timestamptz,observations text);
   create table work_order_equipment(company_id uuid,work_order_id uuid references work_orders(id),equipment_id uuid references equipment(id),is_primary boolean default false,check_status text default 'not_applicable',created_at timestamptz default now(),primary key(work_order_id,equipment_id));
   create table work_order_status_history(company_id uuid,work_order_id uuid,previous_status text,new_status text,changed_by uuid,reason text);
   create table work_order_assignments(work_order_id uuid,technician_id uuid);
   create function current_profile_id() returns uuid language sql stable as $$select current_setting('test.profile')::uuid$$;
   create function current_company_id() returns uuid language sql stable security definer as $$select company_id from profiles where id=current_profile_id()$$;
   create function dmp_active_profile() returns profiles language plpgsql stable security definer as $$declare p profiles;begin select * into p from profiles where id=current_profile_id() and active and deleted_at is null;if p.id is null then raise exception 'Perfil inactivo';end if;return p;end$$;
   create function has_any_role(text[]) returns boolean language sql stable security definer as $$select exists(select 1 from profile_roles p join roles r on r.id=p.role_id where p.profile_id=current_profile_id() and r.name=any($1))$$;
   create function is_platform_superadmin() returns boolean language sql as $$select false$$;
   create function assert_member_of_current_company(uuid) returns void language plpgsql as $$begin if $1<>current_company_id() then raise exception 'Fuera de empresa';end if;end$$;
   create function dmp_equipment_code_prefix(uuid) returns text language sql as $$select 'EQ'::text$$;
   create function dmp_ensure_work_order_equipment_check(uuid,uuid,uuid,uuid,text) returns uuid language sql as $$select null::uuid$$;
   create function assign_technician(uuid,uuid,date,time,time,text,uuid) returns void language plpgsql as $$begin insert into work_order_assignments values($1,$2);update work_orders set main_technician_id=$2 where id=$1;end$$;
   create function is_assigned_to_work_order(uuid,uuid) returns boolean language sql as $$select exists(select 1 from work_order_assignments where work_order_id=$1 and technician_id=$2)$$;
   insert into companies values('${A}','Empresa A'),('${B}','Empresa B');
   insert into profiles(id,company_id,primary_area) values('${actor}','${A}','SAT'),('${other}','${B}','SAT'),('${tech}','${A}','Tecnico');
   insert into roles(name) values('SAT'),('Tecnico');insert into profile_roles select p.id,r.id from profiles p join roles r on r.name=p.primary_area;
   insert into clients(id,company_id) values('${client}','${A}'),('${otherClient}','${B}');
   insert into sites(id,company_id,client_id) values('${site}','${A}','${client}'),('${otherSite}','${B}','${otherClient}');
   insert into equipment_types(id,company_id,name) values('${type}','${A}','Equipo conocido');
   insert into equipment(id,company_id,code,client_id,site_id,equipment_type_id) values('${equipment}','${A}','EQ-EXISTENTE','${client}','${site}','${type}');
  `);
  await db.exec(originalCode);await db.exec(original);await db.exec(sql178);await db.exec(sql179);await db.exec(sql180);
  // Reapplying must preserve the legacy delegate and the public RPC identities.
  await db.exec(sql178);await db.exec(sql179);await db.exec(sql180);
 },30000);
 beforeEach(async()=>{await db.exec('begin');await ctx();});afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db.close();});
 it('reproduces the original code-generator failure and fixes it without partial contracts',async()=>{
  await db.exec(originalCode);await db.exec('savepoint rejected_contract');
  await expect(saveContract()).rejects.toThrow('Tabla no permitida para generar codigo: maintenance_contracts');
  await db.exec('rollback to savepoint rejected_contract');
  expect((await db.query('select * from maintenance_contracts')).rows).toHaveLength(0);
  await db.exec(sql180.replace(/\bbegin;/i,'').replace(/\bcommit;/i,''));
  const first=await saveContract();const second=await saveContract();
  const codes=await db.query<{code:string}>('select code from maintenance_contracts where id=any($1::uuid[]) order by code',[[first,second]]);
  expect(codes.rows.map(row=>row.code)).toEqual(['MNT-000001','MNT-000002']);
  await db.exec('savepoint disallowed_table');
  await expect(db.query("select next_dmp_code($1,'profiles','USR',false,6)",[A])).rejects.toThrow('Tabla no permitida');
  await db.exec('rollback to savepoint disallowed_table');
 });
 it('keeps the original creator as a private delegate after reapplying both migrations',async()=>{const row=await db.query<{private:boolean;public:boolean}>("select not has_function_privilege('authenticated','public.dmp_work_intake_legacy_create(jsonb)','EXECUTE') private,has_function_privilege('authenticated','public.dmp_create_work_order_full(jsonb)','EXECUTE') public");expect(row.rows[0]).toEqual({private:true,public:true});});
 it('creates an installation without equipment without inventing an asset',async()=>{
  const id=await create();const row=await db.query<{main_equipment_id:string|null;type:string}>('select main_equipment_id,type from work_orders where id=$1',[id]);expect(row.rows[0]).toEqual({main_equipment_id:null,type:'Instalacion'});
  expect((await db.query('select * from work_order_equipment where work_order_id=$1',[id])).rows).toHaveLength(0);
 });
 it('creates provisional equipment once and retries the original operation without duplicates or fictional installation dates',async()=>{
  const payload=request({equipment_mode:'new',equipment_selection:[{new:{internal_location:'Entrada'}}]});
  const id=await create(payload);expect(await create(payload)).toBe(id);
  const rows=await db.query<{installation_date:string|null;name:string}>('select e.installation_date,t.name from work_order_equipment w join equipment e on e.id=w.equipment_id join equipment_types t on t.id=e.equipment_type_id where w.work_order_id=$1',[id]);expect(rows.rows).toEqual([{installation_date:null,name:'Equipo por identificar'}]);
 });
 it('associates existing equipment without duplicating it',async()=>{
  const id=await create(request({equipment_mode:'existing',equipment_selection:[{existing_equipment_id:equipment},{existing_equipment_id:equipment}]}));expect((await db.query('select * from work_order_equipment where work_order_id=$1',[id])).rows).toHaveLength(1);
 });
 it('allows the assigned technician to identify equipment after creation and retry safely',async()=>{
  const id=await create(request({technician_id:tech}));await ctx(tech);const op=crypto.randomUUID();const args=[id,op,JSON.stringify([{new:{brand:'Identificado en visita'}}])];await db.query('select dmp_attach_work_equipment($1,$2,$3::jsonb)',args);await db.query('select dmp_attach_work_equipment($1,$2,$3::jsonb)',args);expect((await db.query('select * from work_order_equipment where work_order_id=$1',[id])).rows).toHaveLength(1);
 });
 it('rejects a technician without assignment',async()=>{const id=await create();await ctx(tech);await expect(db.query('select dmp_attach_work_equipment($1,$2,$3::jsonb)',[id,crypto.randomUUID(),'[]'])).rejects.toThrow(/permiso/);});
 it('rejects work and equipment from another company',async()=>{await ctx(other);await expect(create()).rejects.toThrow(/Empresa o creador/);});
 it('executes edit and equipment association atomically',async()=>{const id=await create();const payload={...request(),equipment_mode:'new',equipment_selection:[{new:{model:'Equipo identificado'}}],title:'Parte completado',observations:'Entrada del edificio'};await db.query('select dmp_update_work_intake($1,$2::jsonb)',[id,JSON.stringify(payload)]);const row=await db.query<{title:string;observations:string;main_equipment_id:string}>('select title,observations,main_equipment_id from work_orders where id=$1',[id]);expect(row.rows[0].title).toBe('Parte completado');expect(row.rows[0].main_equipment_id).toBeTruthy();});
 it('plans month-end visits without drift and generates every visit only once, including when no equipment is known',async()=>{
  const payload=contract();const id=await saveContract(payload);expect(await saveContract(payload,id)).toBe(id);
  const visits=await db.query<{due_on:string}>('select due_on::text from maintenance_visits where contract_id=$1 order by due_on',[id]);expect(visits.rows.map(row=>row.due_on)).toEqual(['2026-01-31','2026-02-28','2026-03-31','2026-04-30']);
  await db.query('select dmp_generate_maintenance_plan($1)',[id]);await db.query('select dmp_generate_maintenance_plan($1)',[id]);expect((await db.query('select * from maintenance_visits where contract_id=$1 and work_order_id is not null',[id])).rows).toHaveLength(4);expect((await db.query('select * from work_orders')).rows).toHaveLength(4);
 });
 it('keeps equipment in generated work when contract coverage changes and applies the new coverage only to future work',async()=>{
  const id=await saveContract(contract({equipment_mode:'existing',equipment_selection:[{existing_equipment_id:equipment}]}));const visits=await db.query<{id:string}>('select id from maintenance_visits where contract_id=$1 order by due_on',[id]);
  await db.query('select dmp_generate_maintenance_visit($1)',[visits.rows[0].id]);await db.query('select dmp_set_maintenance_equipment($1,$2,$3::jsonb)',[id,crypto.randomUUID(),'[]']);await db.query('select dmp_generate_maintenance_visit($1)',[visits.rows[1].id]);
  expect((await db.query('select * from work_order_equipment')).rows).toHaveLength(1);
 });
 it('does not duplicate provisional equipment on coverage retry',async()=>{const id=await saveContract();const args=[id,crypto.randomUUID(),JSON.stringify([{new:{model:'Nuevo en contrato'}}])];await db.query('select dmp_set_maintenance_equipment($1,$2,$3::jsonb)',args);await db.query('select dmp_set_maintenance_equipment($1,$2,$3::jsonb)',args);expect((await db.query("select * from equipment where model='Nuevo en contrato'")).rows).toHaveLength(1);});
 it('blocks cross-company contracts and RLS hides the first company records',async()=>{
  const id=await saveContract();await ctx(other);await db.exec('set local role authenticated');expect((await db.query('select * from maintenance_contracts where id=$1',[id])).rows).toHaveLength(0);
  await expect(saveContract(contract())).rejects.toThrow(/centro/);
 });
 it('keeps internal resolvers inaccessible to authenticated users',async()=>{const row=await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','public.dmp_resolve_equipment_selection(uuid,uuid,uuid,jsonb)','EXECUTE') allowed");expect(row.rows[0].allowed).toBe(false);});
});
