import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql=readFileSync(new URL('../../supabase/migrations/171_individual_alert_read_and_close.sql',import.meta.url),'utf8');
describe('individual alert states',()=>{
 it('parses SQL and its procedural functions',async()=>{const parser=await pgQuery();expect(parser.parse(sql).error).toBeNull();expect(parser.parsePlpgsql(sql).error).toBeNull();});
 it('isolates read and close by actor instead of updating the shared recipient',()=>{
  expect(sql).toContain('primary key(recipient_id,profile_id)');
  expect(sql).toContain('ps.profile_id=v_actor.id');
  expect(sql).toContain('where recipient_id=v_row.id and profile_id=v_actor.id');
  expect(sql).not.toMatch(/update public\.alert_recipients set/i);
  expect(sql).toContain('from public,anon,authenticated');
  expect(sql).toContain("ar.recipient_role='Todos'");
  expect(sql).toContain("v_row.recipient_role='Todos'");
  expect(sql).toContain("('SAT','Comercial','Oficina','Gerencia','Tecnico','Todos')");
  expect(sql).toContain('ar.company_id=v_actor.company_id or public.is_platform_superadmin()');
  expect(sql).toContain('ps.profile_id is not null then ps.closed_at');
 });
});
