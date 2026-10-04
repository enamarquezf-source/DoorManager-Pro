import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/153_office_complete_economic_entry_reads.sql', 'utf8');
describe('complete Office economic reads', () => {
  it('adds only scoped Office SELECT policies for the three reviewed entry types', () => {
    for (const table of ['work_order_time_entries', 'work_order_materials', 'work_order_cost_entries']) {
      expect(sql).toContain(`on public.${table}`);
      expect(sql).toContain(`review_work.id=${table}.work_order_id`);
      expect(sql).toContain(`review_work.company_id=${table}.company_id`);
    }
    expect(sql.match(/for select to authenticated/g)).toHaveLength(3);
    expect(sql.match(/company_id=public.current_company_id\(\)/g)).toHaveLength(3);
    expect(sql.match(/has_any_role\(array\['Oficina'\]\)/g)).toHaveLength(3);
    expect(sql).not.toMatch(/for (all|insert|update|delete)|disable row level security|security definer/i);
  });
  it('parses as one transaction without data updates', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(sql).not.toMatch(/^\s*(update|delete|insert)\b/im);
  });
});
