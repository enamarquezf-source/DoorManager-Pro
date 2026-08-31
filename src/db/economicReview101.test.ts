import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/101_fix_economic_review_ambiguous_kind.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_fix_economic_review_101.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_fix_economic_review_101.sql'), 'utf8');

describe('101 economic review ambiguity fix', () => {
  it('renames every conflicting PL/pgSQL variable and qualifies aggregate aliases', () => {
    expect(migration).toContain('v_kind text');
    expect(migration).toContain('v_entry_id uuid');
    expect(migration).toContain('v_sell boolean');
    expect(migration).toContain('v_price numeric');
    expect(migration).toContain('v_source text');
    expect(migration).toContain('v_expected integer');
    expect(migration).toContain('v_actual integer');
    expect(migration).toContain('v_reason text');
    expect(migration).toContain('entries.row_data order by entries.entry_kind,entries.entry_id');
    expect(migration).toContain('group by decision_rows.kind,decision_rows.entry_id');
    expect(migration).not.toMatch(/order by\s+kind\s*,\s*entry_id/i);
  });

  it('preserves the 100 review contract and overload grants', () => {
    expect(migration).toContain('p_zero_sale_confirmed boolean)');
    expect(migration).toContain('dmp024_active_profile');
    expect(migration).toContain("array['superadmin','SAT','Comercial','Gerencia']");
    expect(migration).toContain("i.status<>'cancelada'");
    expect(migration).toContain('facturabilidad explicita requerida');
    expect(migration).toContain('ECONOMIC_REVIEW_APPROVE');
    expect(migration).toContain('line_before');
    expect(migration).toContain('line_after');
    expect(migration).toContain('zero_sale_confirmed');
    expect(migration).toContain('grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text) to authenticated');
    expect(migration).toContain('grant execute on function public.dmp_review_work_order_economic(uuid,jsonb,text,boolean) to authenticated');
  });

  it('keeps both verification files read-only and single-statement', async () => {
    for (const sql of [preflight, postflight]) {
      const parser = await pgQuery();
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|perform)\b/im);
    }
  });

  it('parses migration 101 as a five-statement transaction', async () => {
    const parser = await pgQuery();
    const result = parser.parse(migration);
    expect(result.error).toBeNull();
    expect(result.parse_tree.stmts).toHaveLength(5);
  });
});
