import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql=readFileSync(new URL('../../supabase/migrations/177_employee_hr_beta.sql',import.meta.url),'utf8');
const verification=readFileSync(new URL('../../supabase/verification/verify_177_employee_hr_beta.sql',import.meta.url),'utf8');
describe('private employee labour records',()=>{
 it('parses SQL and PL/pgSQL',async()=>{const parser=await pgQuery();expect(parser.parse(sql).error).toBeNull();expect(parser.parsePlpgsql(sql).error).toBeNull();expect(parser.parse(verification).error).toBeNull();expect(parser.parsePlpgsql(verification).error).toBeNull();});
 it('restricts records, uploads and all RPCs to management in the same company',()=>{
  expect(sql).toContain("array['superadmin','Gerencia']");expect(sql).toContain('id=p_profile_id and company_id=actor.company_id');
  expect(sql).toContain("values('dmp-hr','dmp-hr',false");expect(sql).toContain("bucket_id='dmp-hr' and owner=auth.uid()");
  expect(sql).toContain('revoke all on public.employee_hr_records from public,anon,authenticated');
  expect(sql).toContain("split_part(p_path,'/',2)<>p_profile_id::text");
  expect(sql).toContain('as restrictive for all to authenticated');
  expect(sql).toContain('as restrictive for all to anon');
 });
 it('recalculates amounts on the server, requires a real receipt and makes simulations explicit',()=>{
  expect(sql).toContain("data->>'mode'='actual' and p_path is null");expect(sql).toContain("'statutory_calculation',false");
  expect(sql).toContain("'net_amount',gross-deductions");expect(sql).toContain('employee_hr_payroll_period_idx');
  expect(sql).toContain("p_kind not in ('vacation','terms')");expect(sql).toContain('previous.payload=data');
 });
 it('protects approved vacation overlap and preserves operational source snapshots',()=>{
  expect(sql).toContain("daterange(r.date_from,r.date_to,'[]') && daterange(p_from,p_to,'[]')");
  expect(sql).toContain("r.kind='payroll' and r.date_from>=p_from and r.date_to<=p_to");
  expect(sql).toContain('base||jsonb_build_object');expect(sql).not.toMatch(/update\s+public.cost_productivity_studies/i);
 });
});
