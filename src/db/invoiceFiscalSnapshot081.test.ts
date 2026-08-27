import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/081_invoice_fiscal_snapshot.sql');
const preflight = read('../../supabase/verification/preflight_invoice_fiscal_snapshot_081.sql');
const postflight = read('../../supabase/verification/postflight_invoice_fiscal_snapshot_081.sql');
const billing = read('../modules/BillingModule.tsx');

describe('081 fiscal invoice snapshot', () => {
  it('parses migration and read-only verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('freezes issuer, client, work, lines and totals only when issuing', () => {
    expect(migration).toContain('add column if not exists fiscal_snapshot jsonb');
    expect(migration).toContain("'emitter'");
    expect(migration).toContain("'client'");
    expect(migration).toContain("'lines'");
    expect(migration).toContain("'totals'");
    expect(migration).toContain('fiscal_snapshot=v_snapshot');
    expect(migration).not.toContain('insert into public.invoice_payments');
  });

  it('keeps the preflight executable before the column exists', () => {
    expect(preflight).toContain('information_schema.columns');
    expect(preflight).toContain("to_jsonb(i)->'fiscal_snapshot'");
    expect(preflight).not.toMatch(/and\s+fiscal_snapshot\s+is\s+null/i);
    expect(preflight).toContain('Antes de 081 no es evaluable');
    expect(preflight.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
  });

  it('prints the snapshot when available and excludes internal economics', () => {
    expect(billing).toContain('Imprimir factura');
    expect(billing).toContain('invoice-print-document');
    expect(billing).toContain('invoice.fiscal_snapshot');
    expect(billing).not.toContain('unit_cost');
    expect(billing).not.toContain('margen');
    expect(postflight).toContain('snapshot_shape');
  });
});
