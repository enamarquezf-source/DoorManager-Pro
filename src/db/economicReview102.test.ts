import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/102_fix_economic_review_remaining_ambiguities.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_fix_economic_review_102.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_fix_economic_review_102.sql'), 'utf8');

describe('102 economic review remaining ambiguity fix', () => {
  it('removes variables and aliases that can collide in PL/pgSQL', () => {
    expect(migration).toContain('v_decision jsonb');
    expect(migration).toContain('decision_element(value)');
    expect(migration).toContain('decision_element.value');
    expect(migration).toContain('decision_rows(kind text,entry_id uuid)');
    expect(migration).toContain('economic_entries.row_data order by economic_entries.entry_kind,economic_entries.entry_id');
    expect(migration).not.toMatch(/jsonb_array_elements\(p_decisions\)\s+d\b/i);
    expect(migration).not.toMatch(/for\s+d\s+in/i);
    expect(migration).not.toMatch(/order by\s+kind\s*,\s*entry_id/i);
    expect(migration).not.toMatch(/declare\s+a\s+public\.profiles.*\bw\s+public\.work_orders/i);
  });

  it('preserves the 100/101 economic review contract', () => {
    expect(migration).toContain("array['superadmin','SAT','Comercial','Gerencia']");
    expect(migration).toContain("invoice_record.status<>'cancelada'");
    expect(migration).toContain('facturabilidad explicita requerida');
    expect(migration).toContain('source pertenece al snapshot historico');
    expect(migration).toContain('ECONOMIC_REVIEW_APPROVE');
    expect(migration).toContain('line_before');
    expect(migration).toContain('line_after');
    expect(migration).toContain('zero_sale_confirmed');
    expect(migration).toContain('security definer set search_path=public');
  });

  it('keeps verification CTEs explicit, read-only and single-statement', async () => {
    for (const sql of [preflight, postflight]) {
      const parser = await pgQuery();
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).toContain('checks(check_name,passed,detail) as');
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|perform)\b/im);
    }
  });

  it('parses migration 102 as a five-statement transaction', async () => {
    const parser = await pgQuery();
    const result = parser.parse(migration);
    expect(result.error).toBeNull();
    expect(result.parse_tree.stmts).toHaveLength(5);
  });
});
