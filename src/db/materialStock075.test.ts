import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/075_material_stock_write_boundary.sql');
const preflight = read('../../supabase/verification/preflight_material_stock_075.sql');
const postflight = read('../../supabase/verification/postflight_material_stock_075.sql');

describe('075 material stock write boundary', () => {
  it('parses migration, preflight and postflight SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('protects the real stock creation boundary and audit operation', () => {
    expect(migration).toContain('revoke update on table public.materials from authenticated');
    expect(migration).toContain('dmp_create_material_with_stock');
    expect(migration).toContain('dmp_adjust_material_stock');
    expect(migration).toContain("'MATERIAL_CREATE'");
    expect(migration).not.toContain('alter table');
    expect(migration).not.toContain('delete from');
    expect(migration).not.toContain('update public.materials');
    expect(migration).not.toContain('075_');
  });

  it('keeps verification read-only, complete and safe from the UNION ORDER BY bug', () => {
    for (const sql of [preflight, postflight]) {
      expect(sql.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
      expect(sql).toContain('check_group');
      expect(sql).toContain('affected_rows');
      expect(sql).toContain('details');
    }
    expect(preflight).toContain('MATERIAL_CREATE');
    expect(preflight).toContain('stock_update_currently_granted');
    expect(postflight).toContain("'postcheck_075'");
    expect(postflight).toContain('current_incompatible_audit_rows');
    expect(postflight).toContain('from (select * from checks union all select * from summary) result');
  });
});
