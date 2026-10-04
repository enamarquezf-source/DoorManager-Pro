import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql=readFileSync(new URL('../../supabase/migrations/159_alerts_documents_fleet_prl.sql',import.meta.url),'utf8');
describe('operations recovery 159',()=>{
 it('parses all SQL and procedural functions',async()=>{const p=await pgQuery();expect(p.parse(sql).error).toBeNull();expect(p.parsePlpgsql(sql).error).toBeNull();});
 it('keeps documents private and PRL scoped',()=>{expect(sql).toContain("'dmp-documents',false,10485760");expect(sql).toContain('documents_prl_scope');expect(sql).toContain("l.related_type='Trabajador'");expect(sql).toContain('o.owner=auth.uid()');});
 it('authorizes recipients using roles consistently',()=>{expect(sql).toContain('public.has_any_role(array[r.recipient_role])');expect(sql).toContain("public.dmp_update_alert_recipient(p_alert_recipient_id,'read')");expect(sql).toContain('company_id=a.company_id for update');});
});
