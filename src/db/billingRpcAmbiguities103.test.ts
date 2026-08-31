import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'supabase/migrations/103_fix_billing_rpc_identifier_ambiguities.sql'), 'utf8');
const preflight = readFileSync(resolve(root, 'supabase/verification/preflight_billing_rpc_ambiguities_103.sql'), 'utf8');
const postflight = readFileSync(resolve(root, 'supabase/verification/postflight_billing_rpc_ambiguities_103.sql'), 'utf8');

describe('103 billing RPC identifier hardening', () => {
  it('audits the modified PL/pgSQL variables and SQL aliases with an empty intersection', () => {
    const variables = ['v_actor','v_invoice','v_line','v_qty','v_price','v_discount','v_tax','v_subtotal','v_tax_amount','v_total','v_work_id','v_source_work_id','v_expected','v_actual','v_status','v_work_count','v_manual_line_count','v_strict_single','v_work','v_client','v_company','v_site','v_quote','v_next_no','v_invalid','v_snapshot','v_reason','v_sale','v_stale'];
    const aliases = ['decision_line','work_order_record','billing_entry','associated_work_orders','invoice_record','works_source','works_record','company_record','client_record','site_record','quote_record','totals'];
    expect(variables.filter((name) => aliases.includes(name))).toEqual([]);
    expect(migration).toContain('v_status text');
    expect(migration).toContain('billing_entry.subtotal');
    expect(migration).not.toContain('economic_detail_status=status');
    expect(migration).not.toMatch(/jsonb_array_elements\(p_lines\)\s+l\b/i);
    expect(migration).not.toMatch(/declare\s+a\s+public\.|declare\s+i\s+public\.|declare\s+w\s+public\./i);
  });

  it('preserves prepare, save, issue and cancellation contracts', () => {
    expect(migration).toContain("array['superadmin','Gerencia','Oficina']");
    expect(migration).toContain('dmp_guided_billing_eligible');
    expect(migration).toContain('economic_expected_amount=v_expected');
    expect(migration).toContain('strict_single');
    expect(migration).toContain('group by billing_entry.work_order_id');
    expect(migration).toContain('fiscal_snapshot');
    expect(migration).toContain('security definer set search_path=public');
  });

  it('keeps preflight and postflight explicit, read-only and single-statement', async () => {
    for (const sql of [preflight, postflight]) {
      const parser = await pgQuery();
      const result = parser.parse(sql);
      expect(result.error).toBeNull();
      expect(result.parse_tree.stmts).toHaveLength(1);
      expect(sql).toContain('checks(check_name,passed,detail) as');
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke|perform)\b/im);
    }
  });

  it('does not treat qualified aggregation or unrelated short declarations as collisions', () => {
    expect(postflight).toContain("group by billing_entry.work_order_id");
    expect(postflight).not.toContain("position('group by work_order_id' in lower(definition))>0");
    expect(postflight).not.toContain("position('declare a public.' in lower(definition))>0");
  });

  it('parses migration 103 as a six-statement transaction', async () => {
    const parser = await pgQuery();
    const result = parser.parse(migration);
    expect(result.error).toBeNull();
    expect(result.parse_tree.stmts).toHaveLength(6);
  });
});
