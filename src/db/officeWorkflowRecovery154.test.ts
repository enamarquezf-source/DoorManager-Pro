import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync('supabase/migrations/154_restore_office_workflow_and_routing.sql', 'utf8');
const schema = readFileSync('supabase/migrations/001_initial_dmp_schema.sql', 'utf8');
describe('Office workflow recovery 154', () => {
  it('uses actual equipment columns in the final queue definition', () => {
    const table = schema.slice(schema.indexOf('create table public.equipment ('), schema.indexOf('create table public.equipment_components'));
    expect(table).toContain('code text not null');
    expect(table).not.toMatch(/\bname\s+text/);
    expect(sql).not.toContain('e.name');
    expect(sql).toContain("string_agg(distinct e.code,', ' order by e.code)");
  });
  it('preserves routing and financial boundaries while restoring Office reads', () => {
    expect(sql).toContain('wo.company_id=v_company');
    expect(sql).toContain('wo.economic_review_status is distinct from');
    expect(sql).toContain('not exists (select 1 from public.invoice_work_orders');
    for (const table of ['work_order_time_entries', 'work_order_materials', 'work_order_cost_entries']) {
      expect(sql).toContain(table + '_office_economic_select');
    }
    expect(sql).toContain('pg_get_functiondef');
    expect(sql).not.toContain('update public.invoices');
  });
  it('parses as one atomic migration', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(8);
    expect(sql.match(/^begin;/gm)).toHaveLength(1);
    expect(sql.match(/^commit;/gm)).toHaveLength(1);
  });
});
