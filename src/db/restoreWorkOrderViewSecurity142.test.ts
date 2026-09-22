import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/142_restore_work_order_full_detail_security_invoker.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_142_restore_work_order_full_detail_security_invoker.sql', import.meta.url), 'utf8');

describe('work-order full-detail security invoker hotfix 142', () => {
  it('keeps migration and fail-hard verification SQL parseable', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('restores security_invoker without recreating the view or changing its economic column', () => {
    expect(migration).toContain('alter view public.v_work_order_full_detail');
    expect(migration).toContain('set (security_invoker = true)');
    expect(migration).not.toContain('create or replace view');
    expect(migration).not.toContain('drop view');
    expect(verification).toContain("security_invoker=true");
    expect(verification).toContain("column_name = 'economic_status'");
    expect(verification).toContain('v_economic_position <> 25');
    expect(verification).toContain("v_economic_type <> 'text'");
    expect(verification).toContain("table_name = 'work_orders'");
    expect(verification).toContain("column_name = 'economic_status'");
    expect(verification).toContain("v_base_nullable <> 'NO'");
  });
});
