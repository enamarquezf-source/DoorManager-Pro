import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDemoTestDatabase } from '../../scripts/demo/testDatabase.mjs';
import { demoSchemaBundle } from '../../scripts/demo/schemaBundle.mjs';

let db: any; let own: any;
const visitor = '00000000-0000-4000-8000-000000000091';
const sql = readFileSync('supabase/demo/007_demo_equipment_history.sql', 'utf8');
beforeAll(async () => {
 db = await createDemoTestDatabase(); await db.exec(demoSchemaBundle());
 for (const name of ['002_public_demo', '004_technician_demo_repairs', '005_demo_role_journeys', '006_demo_procurement_guide']) await db.exec(readFileSync(`supabase/demo/${name}.sql`, 'utf8'));
 await db.exec('update dmp_demo_config set enabled=true');
 await db.query('insert into auth.users(id,is_anonymous) values($1,true)', [visitor]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [visitor]);
 await db.query("select dmp_demo_start('Tecnico')");
 own = (await db.query("select dmp_demo_prepare_journey('Tecnico') s")).rows[0].s;
 await db.exec(sql);
}, 30000);
afterAll(async () => { await db?.close(); });
it('backfills two dated, non-billable interventions for each sample equipment without answering the current checks', async () => {
 const rows = (await db.query("select * from work_orders where company_id=$1 and code like 'HIST-%'", [own.company_id])).rows;
 expect(rows).toHaveLength(6);
 expect(new Set(rows.map((r:any) => r.main_equipment_id)).size).toBe(3);
 for (const row of rows) {
  expect(row.billable).toBe(false); expect(row.status).toBe('Finalizado tecnicamente');
  expect(row.work_performed).toContain('SIMULACIÓN'); expect(row.result).toContain('SIMULACIÓN');
  expect(Date.parse(row.created_at)).toBeLessThan(Date.now() - 30*86400000);
 }
 expect((await db.query('select count(*) n from checks where work_order_id=$1', [own.work_order_id])).rows[0].n).toBe(3);
 expect((await db.query("select count(*) n from check_item_results where company_id=$1 and result<>'Sin revisar'", [own.company_id])).rows[0].n).toBe(0);
 expect((await db.query('select count(*) n from work_order_time_entries where company_id=$1', [own.company_id])).rows[0].n).toBe(0);
});
it('lets the assigned technician read the history and keeps the active work when preparing again', async () => {
 await db.exec('set role authenticated');
 try {
  expect((await db.query("select count(*) n from work_orders where code like 'HIST-%'")).rows[0].n).toBe(6);
  await expect(db.query('select dmp_demo_seed_equipment_history($1)', [own.company_id])).rejects.toThrow(/permission denied/);
  const next = (await db.query("select dmp_demo_prepare_journey('Tecnico') s")).rows[0].s;
  expect(next.work_order_id).toBe(own.work_order_id);
 } finally { await db.exec('reset role'); }
});
it('is idempotent on reinstallation', async () => {
 await db.exec(sql);
 expect((await db.query("select count(*) n from work_orders where company_id=$1 and code like 'HIST-%'", [own.company_id])).rows[0].n).toBe(6);
});
it('prepares history for new visitors, isolates it and removes it with their disposable company', async () => {
 const second = '00000000-0000-4000-8000-000000000092';
 await db.query('insert into auth.users(id,is_anonymous) values($1,true)', [second]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [second]);
 await db.query("select dmp_demo_start('Tecnico')");
 const next = (await db.query("select dmp_demo_prepare_journey('Tecnico') s")).rows[0].s;
 await db.exec('set role authenticated');
 try {
  expect((await db.query("select count(*) n from work_orders where code like 'HIST-%'")).rows[0].n).toBe(6);
  expect((await db.query('select count(*) n from work_orders where company_id=$1', [own.company_id])).rows[0].n).toBe(0);
 } finally { await db.exec('reset role'); }
 await db.query('select dmp_demo_finish()');
 await db.query('select dmp_demo_purge($1)', [next.id]);
 expect((await db.query('select count(*) n from work_orders where company_id=$1', [next.company_id])).rows[0].n).toBe(0);
 expect((await db.query("select count(*) n from work_orders where company_id=$1 and code like 'HIST-%'", [own.company_id])).rows[0].n).toBe(6);
});
