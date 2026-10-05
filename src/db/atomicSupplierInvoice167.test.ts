import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
const sql = readFileSync(new URL('../../supabase/migrations/167_atomic_supplier_invoice_draft.sql', import.meta.url), 'utf8');

describe('atomic supplier invoice draft migration', () => {
  it('parses SQL and the complete procedural function', async () => {
    const parser = await pgQuery();
    expect(parser.parse(sql).error).toBeNull();
    expect(parser.parsePlpgsql(sql).error).toBeNull();
  });
  it('retains RLS, scopes recovery and serializes creation without modifying stock or payments', () => {
    expect(sql).toContain('security invoker');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('result.company_id is distinct from company');
    expect(sql).toContain('result.created_by is distinct from actor');
    expect(sql).toContain("public.has_permission('supplier_invoices.update')");
    expect(sql.indexOf("jsonb_build_object('recovered',true)")).toBeLessThan(sql.indexOf('insert into public.supplier_invoices'));
    for (const table of ['supplier_invoices', 'supplier_invoice_lines', 'supplier_invoice_allocations']) expect(sql).toContain(`insert into public.${table}`);
    expect(sql).toMatch(/revoke all.*from public,anon/);
    expect(sql).not.toMatch(/security definer|disable row level security|exception when|insert into public\.(stock_movements|supplier_invoice_payments)|update public\.(materials|purchase_receipt_lines)/i);
  });
});
