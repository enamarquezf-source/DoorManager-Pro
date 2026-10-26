import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createDemoTestDatabase } from '../../scripts/demo/testDatabase.mjs';
import { demoSchemaBundle } from '../../scripts/demo/schemaBundle.mjs';
import { isTravelCost } from '../shared/travelCosts';
let db:any; let own:any;
beforeAll(async()=>{
 db=await createDemoTestDatabase(); await db.exec(demoSchemaBundle());
 for(const file of ['002_public_demo','004_technician_demo_repairs','005_demo_role_journeys','006_demo_procurement_guide','007_demo_equipment_history','008_demo_resource_rates'])await db.exec(readFileSync(`supabase/demo/${file}.sql`,'utf8'));
 await db.exec('update dmp_demo_config set enabled=true');
 const user='00000000-0000-4000-8000-000000000095';
 await db.query('insert into auth.users(id,is_anonymous)values($1,true)',[user]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 await db.query("select dmp_demo_start('Tecnico')");own=(await db.query("select dmp_demo_prepare_journey('Tecnico') s")).rows[0].s;
},30000);
afterAll(async()=>await db?.close());
it('provides usable travel and platform rates without pre-registering costs',async()=>{
 await db.exec('set role authenticated');
 try{
 const rows=(await db.query("select * from dmp_rate_catalog_for_selection('cost')")).rows;
 expect(rows.map((r:any)=>r.code).sort()).toEqual(['desplazamiento','plataforma_demo','salida_demo']);
 expect(rows.every((r:any)=>r.rate_version_id)).toBe(true);
 expect((await db.query('select count(*) n from work_order_cost_entries where work_order_id=$1',[own.work_order_id])).rows[0].n).toBe(0);
 const rate=rows.find((r:any)=>r.code==='desplazamiento');
 const id=(await db.query('select dmp_upsert_work_order_cost_entry($1::jsonb) id',[JSON.stringify({work_order_id:own.work_order_id,concept_id:rate.id,quantity:25,description:'Desplazamiento de prueba'})])).rows[0].id;
 const row=(await db.query('select * from work_order_cost_entries where id=$1',[id])).rows[0];
 expect(Number(row.total_cost)).toBe(7.5);expect(Number(row.total_price)).toBe(15);expect(isTravelCost(row)).toBe(true);
 }finally{await db.exec('reset role');}
});
it('does not duplicate resource versions or overwrite a visitor price on repeated preparation',async()=>{
 await db.query("update rate_versions set sale_amount=0.85 where company_id=$1 and rate_id=(select id from rate_catalog where company_id=$1 and code='desplazamiento')",[own.company_id]);
 const count=(await db.query('select count(*) n from rate_versions where company_id=$1',[own.company_id])).rows[0].n;
 await db.exec(readFileSync('supabase/demo/008_demo_resource_rates.sql','utf8'));
 await db.query("select dmp_demo_prepare_journey('Tecnico')");
 expect((await db.query('select count(*) n from rate_versions where company_id=$1',[own.company_id])).rows[0].n).toBe(count);
 expect(Number((await db.query("select sale_amount from rate_versions where company_id=$1 and rate_id=(select id from rate_catalog where company_id=$1 and code='desplazamiento')",[own.company_id])).rows[0].sale_amount)).toBe(0.85);
});
