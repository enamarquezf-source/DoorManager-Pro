import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/106_fix_prepare_invoice_quote_amount.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_prepare_invoice_quote_106.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_prepare_invoice_quote_106.sql'), 'utf8');

describe('106 prepare invoice quote amount fix', () => {
  it('uses the canonical historical quote amount and preserves quote immutability', () => {
    expect(migration).toContain('v_quote numeric');
    expect(migration).toContain('coalesce(q.taxable_base, q.subtotal_sale, q.subtotal, 0)');
    expect(migration).toContain('v_quote - v_quote_accum');
    expect(migration).not.toContain('update public.quotes');
    expect(migration).not.toContain('insert into public.quotes');
    expect(migration).not.toContain('delete from public.quotes');
  });

  it('parses the migration and read-only verification queries', async () => {
    const parser = await pgQuery();
    const migrationResult = parser.parse(migration);
    expect(migrationResult.error).toBeNull();
    for (const sql of [preflight, postflight]) {
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
      expect(sql).toContain('select check_name, passed, detail from checks');
    }
  });
});
