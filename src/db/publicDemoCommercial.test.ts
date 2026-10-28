import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {createDemoTestDatabase} from '../../scripts/demo/testDatabase.mjs';
import {demoSchemaBundle} from '../../scripts/demo/schemaBundle.mjs';
it('converts a commercial quote without widening assignment permissions, then lets SAT assign it',async()=>{
 const db=await createDemoTestDatabase();
 try{
 await db.exec(demoSchemaBundle());
 for(const name of ['002_public_demo','004_technician_demo_repairs','005_demo_role_journeys'])await db.exec(readFileSync(`supabase/demo/${name}.sql`,'utf8'));
 await db.exec("update dmp_demo_config set enabled=true;insert into auth.users(id,is_anonymous) values('00000000-0000-4000-8000-000000000095',true);select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000095',false);select dmp_demo_start('Comercial');");
 const s=(await db.query("select dmp_demo_prepare_journey('Comercial') s")).rows[0].s as any;
 const tech=(await db.query("select profile_id from dmp_demo_role_profiles where company_id=$1 and role_name='Tecnico'",[s.company_id])).rows[0].profile_id;
 await db.exec('set role authenticated');
 const client=(await db.query("insert into clients(company_id,code,legal_name)values($1,'CLI-TEST','Cliente comercial')returning id",[s.company_id])).rows[0].id;
 const site=(await db.query("insert into sites(company_id,client_id,code,name)values($1,$2,'CEN-TEST','Centro comercial')returning id",[s.company_id,client])).rows[0].id;
 const quote=(await db.query("insert into quotes(company_id,client_id,code,title,created_by) values($1,$2,'PRE-TEST','Reparación',$3)returning id",[s.company_id,client,s.profile_id])).rows[0].id;
 await db.query("insert into quote_lines(company_id,quote_id,line_type,description,quantity,unit_cost,unit_price,tax_rate) values($1,$2,'other','Ajuste ficticio',1,25,45,21)",[s.company_id,quote]);
 await db.query("select dmp_change_quote_status($1,'Enviado','Prueba','cliente@example.invalid')",[quote]);
 await db.query("select dmp_change_quote_status($1,'Aceptado','Aceptación ficticia',null)",[quote]);
 const payload={company_id:s.company_id,created_by:s.profile_id,created_role:'Comercial',quote_id:quote,client_id:client,site_id:site,title:'Reparación',type:'Correctivo',origin:'Comercial',scheduled_date:'2026-10-28',technician_id:tech,equipment_mode:'unknown',equipment_selection:[],client_operation_id:crypto.randomUUID()};
 await expect(db.query('select dmp_create_work_order_full($1::jsonb)',[JSON.stringify(payload)])).rejects.toThrow('No tienes permisos para asignar tecnicos');
 expect((await db.query('select count(*) n from work_orders where quote_id=$1',[quote])).rows[0].n).toBe(0);
 const noAssignment={...payload,technician_id:null};
 const work=(await db.query('select dmp_create_work_order_full($1::jsonb) id',[JSON.stringify(noAssignment)])).rows[0].id;
 expect((await db.query('select dmp_create_work_order_full($1::jsonb) id',[JSON.stringify(noAssignment)])).rows[0].id).toBe(work);
 await db.exec('reset role');await db.query("select dmp_demo_prepare_journey('SAT')");await db.exec('set role authenticated');
 await db.query("select assign_technician($1,$2,current_date,null,null,'Principal',current_profile_id())",[work,tech]);
 expect(work).toBeTruthy();expect((await db.query('select quote_id,main_technician_id from work_orders where id=$1',[work])).rows[0]).toMatchObject({quote_id:quote,main_technician_id:tech});
 }finally{await db.close();}
},30000);
