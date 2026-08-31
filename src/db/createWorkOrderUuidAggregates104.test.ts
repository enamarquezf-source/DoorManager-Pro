import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/104_fix_runtime_uuid_aggregates.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_create_work_order_full_104.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_create_work_order_full_104.sql'), 'utf8');
const source087 = readFileSync(resolve(root, 'supabase/migrations/087_fix_installation_check_template_resolution.sql'), 'utf8');
const source064 = readFileSync(resolve(root, 'supabase/migrations/064_resolve_check_technician_from_work_order.sql'), 'utf8');

describe('104 runtime UUID aggregate hardening', () => {
  it('identifies the trigger dependency and the separate single-company runtime defect', () => {
    expect(source064).toContain('min(a.technician_id)');
    expect(migration).toContain('create or replace function public.resolve_check_technician_from_work_order()');
    expect(migration).not.toContain('dmp_operating_company_id');
  });

  it('replaces UUID aggregates with cardinality-controlled selection', () => {
    expect(migration).toContain('select count(distinct a.technician_id)');
    expect(migration).toContain('select a.technician_id');
    expect(migration).toContain('if v_principal_count = 1');
    expect(migration).toContain('if v_active_count = 1');
    expect(migration).not.toMatch(/\b(min|max)\s*\([^)]*(?:id|_id)\s*\)/i);
  });

  it('keeps creation wrapper contracts and read-only verification single-statement', async () => {
    expect(source087).toContain('create or replace function public.create_work_order_full(p_payload jsonb)');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = pg_catalog, public');
    expect(migration).toContain('grant execute on function public.resolve_check_technician_from_work_order() to authenticated');
    for (const sql of [preflight, postflight]) {
      const parser = await pgQuery();
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).toContain('checks(check_name,passed,detail) as');
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|perform)\b/im);
    }
  });

  it('parses migration 104 as a four-statement transaction', async () => {
    const parser = await pgQuery();
    const result = parser.parse(migration);
    expect(result.error).toBeNull();
    expect(result.parse_tree.stmts).toHaveLength(4);
  });
});
