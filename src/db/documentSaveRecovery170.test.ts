import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/170_document_save_recovery.sql', import.meta.url), 'utf8');
describe('document save recovery server', () => {
  it('parses the migration and procedural function', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('keeps exact request receipts private and delegates existing authorization', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('from public,anon,authenticated');
    expect(sql).toContain('public.dmp024_active_profile()');
    for (const expression of ['v_receipt.company_id is distinct from v_actor.company_id', 'v_receipt.actor_id is distinct from v_actor.id', 'v_receipt.payload is distinct from p_payload']) expect(sql).toContain(expression);
    expect(sql).toContain("then 'documents.create' else 'documents.update' end");
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql.indexOf('return v_receipt.document_id')).toBeLessThan(sql.indexOf('v_document_id:=public.dmp_save_document(p_payload)'));
    expect(sql).not.toMatch(/exception when|delete from|update public\.documents|disable row level security/i);
  });
});
