import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/148_sat_queue_review_eligibility.sql', import.meta.url), 'utf8');
const diagnosis = readFileSync(new URL('../../supabase/verification/diagnose_sat_queue_148.sql', import.meta.url), 'utf8');

describe('SAT queue eligibility', () => {
  it('uses the same review states and operational states as the review RPC', () => {
    expect(migration).toContain("wo.sat_review_status in ('pending','returned') and wo.status in ('Finalizado tecnicamente','Devuelto por SAT')");
    expect(migration).toContain('wo.company_id=v_company');
    expect(migration).toContain("p_queue='sat' and not public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).not.toMatch(/update public\.work_orders/i);
  });
  it('preserves a read-only diagnosis for historical inconsistent records', async () => {
    expect(diagnosis).toContain('inconsistent_status');
    expect(diagnosis).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
    const parser = await pgQuery();
    for (const sql of [migration, diagnosis]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });
});
