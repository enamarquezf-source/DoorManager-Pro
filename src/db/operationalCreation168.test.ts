import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql=readFileSync(new URL('../../supabase/migrations/168_operational_register_creation_recovery.sql',import.meta.url),'utf8');
describe('operational register creation recovery',()=>{
 it('parses the SQL and procedural function',async()=>{const parser=await pgQuery();expect(parser.parse(sql).error).toBeNull();expect(parser.parsePlpgsql(sql).error).toBeNull();});
 it('keeps receipts private and preserves existing authorization and exact request identity',()=>{
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('from public,anon,authenticated');
  for(const expression of ['receipt.company_id is distinct from actor.company_id','receipt.actor_id is distinct from actor.id','receipt.kind is distinct from p_kind','receipt.payload is distinct from p_payload'])expect(sql).toContain(expression);
  expect(sql).toContain("public.has_permission('documents.create')");
  expect(sql).toContain('public.dmp_save_operational_register(p_kind,p_payload)');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql.indexOf('return receipt.record_id')).toBeLessThan(sql.indexOf('result:=public.dmp_save_operational_register'));
  expect(sql).not.toMatch(/exception when|delete from|update public\.(vehicles|personnel_certificates)|disable row level security/i);
 });
});
