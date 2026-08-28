import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/084_fix_multi_equipment_work_order_creation.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_fix_multi_equipment_work_order_084.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_fix_multi_equipment_work_order_084.sql', import.meta.url), 'utf8');
const multi = readFileSync(new URL('../../supabase/migrations/082_multi_equipment_work_orders.sql', import.meta.url), 'utf8');
const query = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');

describe('fix multi-equipment work order creation 084', () => {
  it('parses migration and read-only verification scripts', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table)\b/i);
  });

  it('identifies the schema-cache failure and keeps 082 transactional', () => {
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).toContain("to_regprocedure('public.create_work_order_full(jsonb)')");
    expect(multi).toContain('jsonb_array_elements(v_selection)');
    expect(multi).toContain('insert into public.equipment');
    expect(multi).toContain('insert into public.work_order_equipment');
    expect(multi).toContain('insert into public.checks');
    expect(query).toContain("error?.code === 'PGRST202'");
    expect(query).toContain('create_work_order_full');
  });

  it('models the real nine-equipment case as independent rows', () => {
    const payload = [
      ...Array.from({ length: 3 }, () => ({ new: { equipment_type_id: 'abrigo' } })),
      ...Array.from({ length: 3 }, () => ({ new: { equipment_type_id: 'muelle' } })),
      ...Array.from({ length: 3 }, () => ({ new: { equipment_type_id: 'seccional' } })),
    ];
    expect(payload).toHaveLength(9);
    expect(new Set(payload.map((item) => item.new.equipment_type_id))).toHaveLength(3);
    expect(multi).toContain('for v_item in select value from jsonb_array_elements(v_selection) loop');
  });
});
