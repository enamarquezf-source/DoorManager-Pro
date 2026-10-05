import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { canAssignTechnicalWorkOrder } from '../shared/assignmentEligibility';

const sql = readFileSync(new URL('../../supabase/migrations/163_returned_technical_work_visibility.sql', import.meta.url), 'utf8');
describe('returned technical work visibility', () => {
  it('keeps active technical states aligned between assignment and schedule', async () => {
    const states = sql.match(/wo\.status in \(([^)]+)\)/)![1].split(',').map(value => value.trim().slice(1, -1));
    for (const status of states) expect(canAssignTechnicalWorkOrder({ status })).toBe(true);
    expect(states).toContain('Devuelto por SAT');
    expect(states).not.toContain('Finalizado tecnicamente');
    expect((await pgQuery()).parse(sql).error).toBeNull();
  });
  it('does not hide a part without a site or restore a completed assignment', () => {
    expect(sql).toContain('left join public.sites s');
    expect(sql).toContain('with (security_invoker = true)');
    expect(sql).toContain("a.status not in ('Finalizado','Cancelado')");
    expect(sql).not.toMatch(/^\s*(update|insert|delete)\b/im);
  });
});
