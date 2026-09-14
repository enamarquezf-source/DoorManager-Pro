import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/127_purchase_receipt_code_generation.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_127_purchase_receipt_code_generation.sql', import.meta.url), 'utf8');
const migration124 = readFileSync(new URL('../../supabase/migrations/124_auth_rbac_runtime_fix.sql', import.meta.url), 'utf8');

describe('PURCHASE-RECEIPT-CODE-001', () => {
  it('keeps the canonical receipt code contract and expands only the explicit allowlist', () => {
    expect(migration).toContain("'purchase_orders','purchase_receipts'");
    expect(migration).toContain('assert_member_of_current_company');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('from public.%I');
    expect(migration).toContain('lpad(v_sequence::text, greatest(p_width, 1), \'0\')');
    expect(migration).toContain('revoke all on function public.next_dmp_code');
    expect(migration).toContain('grant execute on function public.next_dmp_code');
    expect(migration124).toContain("next_dmp_code(v_company,'purchase_receipts','REC',true,6)");
    expect(migration).not.toMatch(/p_table_name\s*<>\s*all\s*\(\s*array\['purchase_receipts'\]\s*\)/i);
  });

  it('verifies signature, security, scope, concurrency, format and receipt call without writes', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    for (const value of ['to_regprocedure', 'SECURITY DEFINER', 'search_path=public', 'aclexplode', 'purchase_orders', 'purchase_receipts', 'pg_advisory_xact_lock', 'current_company', '%I', 'purchase_receipt', 'true', '6']) expect(verification.toLowerCase()).toContain(value.toLowerCase());
  });
});
