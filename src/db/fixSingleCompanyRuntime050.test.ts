import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration049 = readFileSync(new URL('../../supabase/migrations/049_single_company_mode.sql', import.meta.url), 'utf8');
const migration050 = readFileSync(new URL('../../supabase/migrations/050_fix_single_company_runtime.sql', import.meta.url), 'utf8');
const queryService = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');

function functionBody(sql: string, name: string) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
  expect(match?.[0]).toBeTruthy();
  return match![0];
}

describe('050 single-company runtime fix', () => {
  it('parses as SQL and replaces the function introduced by 049', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration050).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(migration049).toContain('create or replace function public.dmp_operating_company_id()');
    expect(migration050).toContain('create or replace function public.dmp_operating_company_id()');
  });

  it('does not use min/max over companies.id uuid in dmp_operating_company_id', () => {
    const body = functionBody(migration050, 'dmp_operating_company_id');
    expect(body).not.toMatch(/\bmin\s*\(\s*id\s*\)/i);
    expect(body).not.toMatch(/\bmax\s*\(\s*id\s*\)/i);
    expect(body).not.toMatch(/\bmin\s*\(\s*c\.id\s*\)/i);
    expect(body).not.toMatch(/\bmax\s*\(\s*c\.id\s*\)/i);
  });

  it('counts first, then selects the only active company id directly', () => {
    const body = functionBody(migration050, 'dmp_operating_company_id');
    expect(body).toContain('select count(*)');
    expect(body).toContain('into v_count');
    expect(body).toContain('if v_count = 0 then');
    expect(body).toContain('if v_count > 1 then');
    expect(body).toContain('select id');
    expect(body).toContain('into v_company_id');
    expect(body).toContain('return v_company_id');
  });

  it('stays non-destructive and keeps RLS/service-role constraints untouched', () => {
    expect(migration050).not.toMatch(/delete\s+from\s+public\.(companies|clients|sites|equipment|quotes|work_orders|materials)/i);
    expect(migration050).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(migration050).not.toContain('service_role');
    expect(migration050).not.toMatch(/update\s+public\.(clients|sites|equipment|quotes|work_orders|materials).*company_id/is);
  });

  it('shows a clear frontend error when company resolution fails', () => {
    expect(queryService).toContain('DMP operating company resolution failed');
    expect(queryService).toContain('No se ha podido determinar la empresa de DoorManager');
    expect(queryService).toContain('details: error?.details');
    expect(queryService).toContain('hint: error?.hint');
    expect(queryService).toContain('code: error?.code');
  });
});
