import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/176_cost_study_work_coverage.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_176_cost_study_work_coverage.sql', import.meta.url), 'utf8');
describe('work coverage in company studies', () => {
  it('parses SQL and PL/pgSQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
    expect(parser.parse(verification).error).toBeNull();
    expect(parser.parsePlpgsql(verification).error).toBeNull();
  });
  it('includes invoiced, completed and consumed work independently of time entries without joining invoice lines into sums', () => {
    expect(sql).toContain('w.has_hours or w.has_materials or w.has_resources or w.invoiced_in_period or w.completed_in_period or w.scheduled_in_period');
    expect(sql).toContain('exists(select 1 from public.invoice_work_orders');
    expect(sql).toContain('l.company_id = actor.company_id');
    expect(sql).toContain("i.status not in ('borrador','cancelada')");
    expect(sql).toContain("w.finished_at at time zone 'Europe/Madrid'");
    expect(sql).toContain("'work_scope_version',2");
    expect(sql).not.toMatch(/update\s+public.cost_productivity_studies/i);
  });
});
