import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/165_atomic_alert_creation.sql', import.meta.url), 'utf8');

describe('atomic alert creation migration', () => {
  it('parses SQL and the complete procedural function', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('retains RLS and serializes retries without changing existing data on installation', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('result.created_by is distinct from actor');
    expect(sql).toContain('select distinct company,result.id');
    expect(sql).toContain("public.next_dmp_code(company,'alerts','AVI',true,6)");
    expect(sql).not.toMatch(/disable row level security|security definer|exception when/i);
    expect(sql).toMatch(/revoke all.*from public,anon/);
  });
});
