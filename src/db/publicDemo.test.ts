import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDemoTestDatabase } from '../../scripts/demo/testDatabase.mjs';
import { demoSchemaBundle } from '../../scripts/demo/schemaBundle.mjs';

let db: any;
const a='00000000-0000-4000-8000-000000000011', b='00000000-0000-4000-8000-000000000012';
const auth = async (id: string) => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const session = async () => (await db.query('select dmp_demo_session() value')).rows[0].value;
beforeAll(async () => {
  db=await createDemoTestDatabase();
  await db.exec(demoSchemaBundle());
  await db.exec(readFileSync('supabase/demo/002_public_demo.sql','utf8'));
  await db.exec(`update dmp_demo_config set enabled=true; insert into auth.users(id,is_anonymous) values('${a}',true),('${b}',true);`);
},30000);
afterAll(async()=>{await db?.close();});

it('installs all final views without customer or employee seed data',async()=>{
  expect((await db.query('select count(*) total from companies')).rows[0].total).toBe(0);
  expect((await db.query('select count(*) total from clients')).rows[0].total).toBe(0);
  const names=(await db.query("select viewname from pg_views where schemaname='public'")).rows.map((r:any)=>r.viewname);
  expect(names).toContain('v_work_order_full_detail');
  expect(names).toContain('v_pending_checks');
});
it('starts an empty office session idempotently and rejects elevated roles',async()=>{
  await auth(a);
  await expect(db.query("select dmp_demo_start('superadmin')")).rejects.toThrow('rol no válido');
  await db.query("select dmp_demo_start('Oficina')"); const first=await session();
  await db.query("select dmp_demo_start('Oficina')"); expect(await session()).toEqual(first);
  expect((await db.query('select count(*) n from clients where company_id=$1',[first.company_id])).rows[0].n).toBe(0);
  await expect(db.query("select dmp_demo_start('Gerencia')")).rejects.toThrow('termina esta sesión');
});
it('seeds a technician with one assigned work order and three different unreviewed equipment checks',async()=>{
  await auth(b);
  await db.query("select dmp_demo_start('Tecnico')");
  const own=await session();
  const checks=(await db.query('select ch.*,et.name equipment_type from checks ch join equipment e on e.id=ch.equipment_id join equipment_types et on et.id=e.equipment_type_id where ch.company_id=$1',[own.company_id])).rows;
  expect(checks).toHaveLength(3);
  expect(new Set(checks.map((ch:any)=>ch.equipment_type)).size).toBe(3);
  expect(checks.every((ch:any)=>ch.technician_id===own.profile_id&&ch.global_result==='Sin revisar')).toBe(true);
  expect((await db.query('select count(*) n from check_item_results where company_id=$1',[own.company_id])).rows[0].n).toBe(0);
  expect((await db.query('select count(*) n from work_orders where company_id=$1',[own.company_id])).rows[0].n).toBe(1);
});
it('bounds the operating company and direct RLS reads to the authenticated visitor',async()=>{
  await auth(a); const own=await session();
  expect((await db.query('select dmp_operating_company_id() id')).rows[0].id).toBe(own.company_id);
  await db.exec('grant usage on schema public,auth to authenticated; grant select on companies,clients,profiles to authenticated; set role authenticated;');
  try{
    expect((await db.query('select count(*) n from clients')).rows[0].n).toBe(0);
    expect((await db.query('select id from companies')).rows.map((r:any)=>r.id)).toEqual([own.company_id]);
    expect((await db.query('select distinct company_id from profiles')).rows.map((r:any)=>r.company_id)).toEqual([own.company_id]);
    await expect(db.query('select * from dmp_demo_sessions')).rejects.toThrow('permission denied');
    await expect(db.query("select dmp_demo_purge('00000000-0000-4000-8000-000000000099')")).rejects.toThrow('permission denied');
  }finally{await db.exec('reset role');}
});
it('rejects cross-tenant definer-style writes and revokes access at finish',async()=>{
  await auth(b); const other=await session();
  await auth(a);
  await expect(db.query('insert into clients(company_id,code,legal_name) values($1,$2,$3)',[other.company_id,'WRONG','Otra sesión'])).rejects.toThrow('fuera de tu sesión');
  await db.query('select dmp_demo_finish()');
  expect((await session()).ended).toBe(true);
  expect((await db.query('select current_company_id() id')).rows[0].id).toBeNull();
});
it('purges one finished session transactionally without removing an active visitor',async()=>{
  await auth(a); const own=await session();
  await auth(b); const other=await session();
  await expect(db.query('select dmp_demo_purge($1)',[other.id])).rejects.toThrow('sesión activa');
  await auth('');
  await db.query('select dmp_demo_purge($1)',[own.id]);
  expect((await db.query('select count(*) n from companies where id=$1',[own.company_id])).rows[0].n).toBe(0);
  expect((await db.query('select count(*) n from companies where id=$1',[other.company_id])).rows[0].n).toBe(1);
  expect((await db.query('select count(*) n from checks where company_id=$1',[other.company_id])).rows[0].n).toBe(3);
});
it('purges the populated technician graph, including children with no company_id',async()=>{
  await auth(b); const own=await session();
  await db.query('select dmp_demo_finish()');
  await auth('');
  await db.query('select dmp_demo_purge($1)',[own.id]);
  for(const table of ['companies','profiles','clients','sites','equipment','checks','work_orders','check_template_sections','check_template_items']){
    expect((await db.query(`select count(*) n from ${table}`)).rows[0].n).toBe(0);
  }
  await db.query('select dmp_demo_purge($1)',[own.id]);
  expect((await db.query('select cleanup_state from dmp_demo_sessions where id=$1',[own.id])).rows[0].cleanup_state).toBe('database_done');
});
