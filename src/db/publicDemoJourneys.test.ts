import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDemoTestDatabase} from '../../scripts/demo/testDatabase.mjs';
import {demoSchemaBundle} from '../../scripts/demo/schemaBundle.mjs';
let db:any;let first:any;let second:any;let work:string;
const userA='00000000-0000-4000-8000-000000000081',userB='00000000-0000-4000-8000-000000000082';
const auth=async(id:string)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const prepare=async(role:string)=>(await db.query('select dmp_demo_prepare_journey($1) s',[role])).rows[0].s;
const progress=async()=>(await db.query('select dmp_demo_progress() s')).rows[0].s;
beforeAll(async()=>{
 db=await createDemoTestDatabase();await db.exec(demoSchemaBundle());
 for(const name of ['002_public_demo','004_technician_demo_repairs','005_demo_role_journeys'])await db.exec(readFileSync(`supabase/demo/${name}.sql`,'utf8'));
 await db.exec('update dmp_demo_config set enabled=true');
 await db.query('insert into auth.users(id,is_anonymous) values($1,true),($2,true)',[userA,userB]);
},30000);
afterAll(async()=>{await db?.close();});
it('starts SAT without clients but with an assignable technician and equipment templates',async()=>{
 await auth(userA);await db.query("select dmp_demo_start('SAT')");first=await prepare('SAT');
 expect((await progress()).clients).toBe(0);
 expect((await db.query('select count(*) n from profiles where company_id=$1',[first.company_id])).rows[0].n).toBe(5);
 expect((await db.query('select count(*) n from equipment_types where company_id=$1',[first.company_id])).rows[0].n).toBe(3);
 expect((await db.query('select count(*) n from check_templates where company_id=$1',[first.company_id])).rows[0].n).toBe(3);
 await db.exec('set role authenticated');
 try {
  expect((await db.query("select count(*) n from profiles p join profile_roles pr on pr.profile_id=p.id join roles r on r.id=pr.role_id where r.name='Tecnico' and p.company_id=$1",[first.company_id])).rows[0].n).toBe(1);
 } finally { await db.exec('reset role'); }
});
it('keeps a SAT-created work order and technician assignment when switching profiles',async()=>{
 const tech=(await db.query("select profile_id id from dmp_demo_role_profiles where company_id=$1 and role_name='Tecnico'",[first.company_id])).rows[0].id;
 await db.exec('set role authenticated');
 try{
 const client=(await db.query("insert into clients(company_id,code,legal_name) values($1,'CLI-TEST','Cliente propio') returning id",[first.company_id])).rows[0].id;
 const site=(await db.query("insert into sites(company_id,client_id,code,name) values($1,$2,'CEN-TEST','Centro propio') returning id",[first.company_id,client])).rows[0].id;
 work=(await db.query("insert into work_orders(company_id,code,client_id,site_id,title,type,origin,created_by,created_role,main_technician_id,scheduled_date) values($1,'PAR-TEST',$2,$3,'Mi trabajo','Mantenimiento','SAT',$4,'SAT',$5,current_date) returning id",[first.company_id,client,site,first.profile_id,tech])).rows[0].id;
 await db.query('insert into work_order_assignments(company_id,work_order_id,technician_id,assigned_by,assignment_date) values($1,$2,$3,$4,current_date)',[first.company_id,work,tech,first.profile_id]);
 }finally{await db.exec('reset role');}
 const next=await prepare('Tecnico');
 expect(next.company_id).toBe(first.company_id);expect(next.profile_id).toBe(tech);expect(next.work_order_id).toBe(work);
 await db.exec('set role authenticated');
 try{
 expect((await db.query('select id from work_orders')).rows.map((r:any)=>r.id)).toEqual([work]);
 expect((await db.query('select current_profile_id() id')).rows[0].id).toBe(tech);
 await expect(db.query("insert into clients(company_id,code,legal_name)values($1,'FORBIDDEN','Técnico')",[first.company_id])).rejects.toThrow();
 await expect(db.query('select * from dmp_demo_role_profiles')).rejects.toThrow('permission denied');
 await db.query('select dmp_update_work_order_operational_fields($1,$2::jsonb)',[work,JSON.stringify({work_performed:'Ajuste y comprobación de funcionamiento'})]);
 await db.query('select dmp_upsert_work_order_time_entry($1::jsonb)',[JSON.stringify({work_order_id:work,profile_id:tech,duration_minutes:120,manual_duration:true,description:'Trabajo técnico de prueba',source:'additional',contributes_to_sale:true})]);
 await db.query("select dmp_finalize_work_order_technical($1,'{}'::jsonb)",[work]);
 expect((await progress()).completed_work).toBe(1);
 }finally{await db.exec('reset role');}
 expect((await prepare('SAT')).profile_id).toBe(first.profile_id);
 await db.exec('set role authenticated');
 try{
 await db.query("select dmp_review_work_order_sat(p_work_order_id=>$1,p_decision=>'approved',p_destination=>'facturacion',p_commercial_profile_id=>null,p_flags=>'{\"work_completed\":true}'::jsonb,p_reason=>'Revisión de prueba')",[work]);
 expect((await progress()).sat_approved).toBe(1);
 }finally{await db.exec('reset role');}
 expect((await db.query('select count(*) n from profiles where auth_user_id=$1',[userA])).rows[0].n).toBe(1);
 await expect(prepare('superadmin')).rejects.toThrow('rol no válido');
});
it('gives Oficina an invoiceable work order and supports draft, issue and a simulated payment',async()=>{
 await auth(userB);await db.query("select dmp_demo_start('Oficina')");second=await prepare('Oficina');
 expect((await progress()).works).toBe(1);
 const ready=(await db.query("select id,sale_amount,dmp_guided_billing_eligible(id) ready from work_orders where company_id=$1",[second.company_id])).rows[0];
 expect(ready.ready).toBe(true);expect(Number(ready.sale_amount)).toBe(145);
 await db.exec('set role authenticated');
 try{
 const inv=(await db.query("select dmp_prepare_invoice_from_work_order($1,current_date+15,'SIMULACIÓN',21) id",[ready.id])).rows[0].id;
 await db.query('select dmp_issue_invoice($1,false,null)',[inv]);
 const account=(await db.query('select id from treasury_accounts where company_id=$1',[second.company_id])).rows[0].id;
 await db.query("select dmp_record_invoice_payment($1,100,current_date,'efectivo','DEMO','Sin cargo real',$2)",[inv,account]);
 expect((await progress()).payments).toBe(1);
 expect((await db.query('select paid_amount from invoices where id=$1',[inv])).rows[0].paid_amount).toBe('100.00');
 }finally{await db.exec('reset role');}
 await prepare('Oficina');expect((await progress()).works).toBe(1);
});
it('seeds management with real economic sources, positive and negative margins and multiple employees',async()=>{
 await auth(userB);await prepare('Gerencia');
 const values=await progress();expect(values.works).toBe(13);expect(values.payments).toBe(2);
 const rows=(await db.query('select margin_amount,time_cost,material_cost from v_work_order_economic_summary where company_id=$1',[second.company_id])).rows;
 expect(rows.some((r:any)=>Number(r.margin_amount)<0)).toBe(true);
 expect(rows.some((r:any)=>Number(r.margin_amount)>0)).toBe(true);
 expect(rows.every((r:any)=>Number(r.time_cost)>0&&Number(r.material_cost)>0)).toBe(true);
 expect((await db.query('select count(distinct profile_id) n from work_order_time_entries where company_id=$1',[second.company_id])).rows[0].n).toBe(3);
 expect((await db.query('select count(*) n from employee_hr_records where company_id=$1',[second.company_id])).rows[0].n).toBe(9);
 await db.exec('set role authenticated');
 try {
 const sources=(await db.query("select dmp_cost_study_sources(current_date-90,current_date) s")).rows[0].s;
 expect(sources.time_entries.length).toBe(13);expect(sources.materials.length).toBe(13);
 expect((await db.query('select distinct company_id from work_orders')).rows.map((r:any)=>r.company_id)).toEqual([second.company_id]);
 }finally{await db.exec('reset role');}
 await prepare('Gerencia');expect((await progress()).works).toBe(13);
});
it('purges the expanded company graph without affecting another visitor, and prevents expired role switches',async()=>{
 await auth(userB);await db.query('select dmp_demo_finish()');await auth('');
 await db.query('select dmp_demo_purge($1)',[second.id]);
 for(const table of ['companies','profiles','dmp_demo_role_profiles','dmp_demo_scenarios','invoices','invoice_payments','employee_hr_records','treasury_accounts'])expect((await db.query(`select count(*) n from ${table} where ${table==='companies'?'id':'company_id'}=$1`,[second.company_id])).rows[0].n).toBe(0);
 expect((await db.query('select id from work_orders where company_id=$1',[first.company_id])).rows[0].id).toBe(work);
 await auth(userA);await db.query("update dmp_demo_sessions set expires_at=now()-interval '1 minute' where id=$1",[first.id]);
 await expect(prepare('Gerencia')).rejects.toThrow('sesión caducada');
 await expect(db.query('select dmp_demo_progress()')).rejects.toThrow('sesión caducada');
});
it('keeps the three technician checks when starting directly after the catalog upgrade',async()=>{
 const id='00000000-0000-4000-8000-000000000083';
 await auth('');await db.query('insert into auth.users(id,is_anonymous)values($1,true)',[id]);await auth(id);
 await db.query("select dmp_demo_start('Tecnico')");const own=await prepare('Tecnico');
 expect((await db.query('select count(*) n from checks where company_id=$1',[own.company_id])).rows[0].n).toBe(3);
 expect((await db.query('select count(*) n from equipment_types where company_id=$1',[own.company_id])).rows[0].n).toBe(3);
 expect((await progress()).times).toBe(0);expect((await progress()).work_notes).toBe(0);
 await prepare('Gerencia');const tech=await prepare('Tecnico');
 expect(tech.work_order_id).toBe(own.work_order_id);
 expect((await progress()).times).toBe(0);expect((await progress()).work_notes).toBe(0);
});
