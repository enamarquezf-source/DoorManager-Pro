import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/164_material_stock_traceability_guard.sql', import.meta.url), 'utf8');
describe('stock traceability guard', () => {
  it('parses SQL and procedural code including rollback-on-failure temporary probes', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('protects future changes without rewriting historical or warehouse balances', () => {
    expect(sql).toContain('before insert or update on public.work_order_materials');
    expect(sql).toContain('is not distinct from');
    expect(sql).toContain('on commit drop');
    expect(sql).not.toMatch(/\b(update|insert into|delete from)\s+public\./i);
  });
});
