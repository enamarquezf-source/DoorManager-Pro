import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/074_invoicing_and_collections.sql');
const preflight = read('../../supabase/verification/preflight_invoicing_074.sql');
const postflight = read('../../supabase/verification/postflight_invoicing_074.sql');

describe('074 invoicing deployment contract', () => {
  it('parses migration and verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('contains the complete invoice and collection lifecycle', () => {
    for (const object of ['public.invoices', 'public.invoice_work_orders', 'public.invoice_payments', 'dmp_refresh_invoice_collection', 'dmp_create_invoice_from_work_order', 'dmp_record_invoice_payment', 'dmp_reverse_invoice_payment', 'dmp_cancel_invoice']) expect(migration).toContain(object);
    expect(migration).toContain("'INVOICE_ISSUE'");
    expect(migration).toContain("'PAYMENT_RECORD'");
    expect(migration).toContain('office_validation_status');
    expect(migration).not.toContain('075_');
  });

  it('keeps the deployment checks read-only and complete', () => {
    for (const sql of [preflight, postflight]) {
      expect(sql.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
      expect(sql).toContain('check_group');
      expect(sql).toContain('affected_rows');
      expect(sql).toContain('details');
    }
    expect(preflight).toContain('audit_log_operation_check');
    expect(preflight).toContain('invoice_payments');
    expect(postflight).toContain("'postcheck_074'");
    expect(postflight).toContain('current_incompatible_audit_rows');
  });
});
