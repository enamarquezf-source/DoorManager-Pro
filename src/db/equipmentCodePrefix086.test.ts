import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/086_restore_equipment_code_prefix.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_equipment_code_prefix_086.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_equipment_code_prefix_086.sql', import.meta.url), 'utf8');
const multiEquipment = readFileSync(new URL('../../supabase/migrations/082_multi_equipment_work_orders.sql', import.meta.url), 'utf8');

describe('equipment code prefix restoration 086', () => {
  it('parses migration and read-only verification scripts', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table|notify)\b/i);
  });

  it('restores the canonical mapping used by equipment creation', () => {
    for (const prefix of ['EQ-CUA', 'EQ-BAR', 'EQ-RAP', 'EQ-ENR', 'EQ-COR', 'EQ-BAT', 'EQ-ABR', 'EQ-MUE', 'EQ-PEA', 'EQ-CAN', 'EQ-SEC']) {
      expect(migration).toContain(prefix);
      expect(postflight).toContain(prefix);
    }
    expect(migration).toContain("lower(replace(replace(replace(replace(replace(coalesce(name, ''), 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'))");
    expect(migration).not.toContain('dmp_normalize_text');
    expect(preflight).not.toContain('normalizer_dependency');
    expect(migration).toContain('grant execute on function public.dmp_equipment_code_prefix(uuid) to authenticated');
  });

  it('satisfies the multi-equipment RPC dependency without changing 082', () => {
    expect(multiEquipment).toContain('public.dmp_equipment_code_prefix(v_equipment_type_id)');
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
