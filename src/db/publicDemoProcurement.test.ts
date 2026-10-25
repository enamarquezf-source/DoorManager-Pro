import{readFileSync}from'node:fs';
import{beforeAll,afterAll,it,expect}from'vitest';
import{createDemoTestDatabase}from'../../scripts/demo/testDatabase.mjs';
import{demoSchemaBundle}from'../../scripts/demo/schemaBundle.mjs';
let db:any;let own:any;
const user='00000000-0000-4000-8000-000000000091',other='00000000-0000-4000-8000-000000000092';
const auth=async(id:string)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const progress=async()=>(await db.query('select dmp_demo_progress() s')).rows[0].s;
beforeAll(async()=>{
 db=await createDemoTestDatabase();await db.exec(demoSchemaBundle());
 for(const name of ['002_public_demo','004_technician_demo_repairs','005_demo_role_journeys','006_demo_procurement_guide'])await db.exec(readFileSync(`supabase/demo/${name}.sql`,'utf8'));
 // Reapplying the guided setup must not rename its wrappers recursively.
 await db.exec(readFileSync('supabase/demo/006_demo_procurement_guide.sql','utf8'));
 await db.exec('update dmp_demo_config set enabled=true');
 await db.query('insert into auth.users(id,is_anonymous)values($1,true),($2,true)',[user,other]);
 await auth(user);await db.query("select dmp_demo_start('Oficina')");own=(await db.query("select dmp_demo_prepare_journey('Oficina') s")).rows[0].s;
},30000);
afterAll(async()=>await db?.close());
it('tracks creation, ordering and actual confirmed receipt without inventing stock',async()=>{
 expect((await progress()).catalog_materials).toBe(0);
 const warehouse=(await db.query("select id from warehouses where company_id=$1 and code='ALM-DEMO'",[own.company_id])).rows[0].id;
 await db.exec('set role authenticated');
 try{
 const material=(await db.query("insert into materials(company_id,code,description,unit,cost,price,minimum_stock,stock_controlled) values($1,'MAT-GUIA','Fotocélula de prueba','ud',30,55,2,true) returning id",[own.company_id])).rows[0].id;
 const supplier=(await db.query("insert into suppliers(company_id,name)values($1,'Suministros de prueba')returning id",[own.company_id])).rows[0].id;
 expect((await progress()).catalog_materials).toBe(1);expect((await progress()).suppliers).toBe(1);
 const order=(await db.query("select dmp_create_purchase_order($1,$2,current_date,$3,null,null,'DEMO') id",[own.company_id,supplier,warehouse])).rows[0].id;
 expect((await progress()).purchase_orders).toBe(0);
 const line=(await db.query('select dmp_add_purchase_order_line($1,$2,null,5,30) id',[order,material])).rows[0].id;
 expect((await progress()).purchase_orders).toBe(1);expect((await progress()).ordered_purchases).toBe(0);
 await db.query('select dmp_order_purchase_order($1)',[order]);
 expect((await progress()).ordered_purchases).toBe(1);expect((await progress()).received_stock).toBe(0);
 const receipt=(await db.query("select dmp_create_purchase_receipt($1,current_date,$2,'ALB-DEMO',null) id",[order,warehouse])).rows[0].id;
 await db.query('select dmp_add_purchase_receipt_line($1,$2,5,30)',[receipt,line]);
 expect((await progress()).purchase_receipts).toBe(0);
 await db.query('select dmp_confirm_purchase_receipt($1)',[receipt]);
 expect((await progress()).purchase_receipts).toBe(1);expect((await progress()).received_stock).toBe(1);
 expect(Number((await db.query('select quantity from warehouse_stock where warehouse_id=$1 and material_id=$2',[warehouse,material])).rows[0].quantity)).toBe(5);
 }finally{await db.exec('reset role');}
});
it('keeps progress private and purges purchasing records with the temporary company',async()=>{
 await auth(other);await db.query("select dmp_demo_start('SAT')");await db.query("select dmp_demo_prepare_journey('SAT')");
 expect((await progress()).purchase_orders).toBe(0);expect((await progress()).received_stock).toBe(0);
 await auth(user);await db.query('select dmp_demo_finish()');await auth('');await db.query('select dmp_demo_purge($1)',[own.id]);
 for(const table of ['purchase_orders','purchase_receipts','purchase_receipt_lines','warehouse_stock','warehouses'])expect((await db.query(`select count(*) n from ${table} where company_id=$1`,[own.company_id])).rows[0].n).toBe(0);
});
