import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, 'docs/drafts/094_partial_warranty_billing.sql'), 'utf8');
const files = ['docs/drafts/preflight_partial_warranty_billing_094.sql', 'docs/drafts/postflight_partial_warranty_billing_094.sql', 'docs/drafts/probe_partial_warranty_candidates_094.sql'].map((file) => readFileSync(resolve(root, file), 'utf8'));

describe('094 partial warranty billing', () => {
  it('adds nullable fail-safe decisions without backfill', () => {
    expect(migration).toContain('add column if not exists billing_decision text');
    expect(migration).toContain("billing_decision='facturable'");
    expect(migration).toContain("'cubierto_garantia','facturable'");
    expect(migration).not.toContain('update public.work_order_planned_material_decisions\nset billing_decision');
  });

  it('keeps cost independent and prevents warranty sale destruction', () => {
    expect(migration).toContain('sum(total_cost)');
    expect(migration).toContain("source='additional' and contributes_to_sale");
    expect(migration).toContain("v_work.warranty and not v_billable then 'garantia'");
    expect(migration).not.toContain('if v_warranty then v_billable := false');
  });

  it('protects drafts and issued invoices and keeps the technician out', () => {
    expect(migration).toContain("v_invoice_status='borrador'");
    expect(migration).toContain('ya tiene una factura y no admite cambios de cobertura');
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).not.toContain("array['superadmin','SAT','Gerencia','Oficina','Tecnico']");
  });

  it('does not create zero-value drafts and filters warranty lines', () => {
    expect(migration).toContain('v_sale<=0');
    expect(migration).toContain('no existe desglose facturable positivo');
    expect(migration).toContain('not v_work.warranty or exists');
    expect(migration).toContain("source='additional' and contributes_to_sale");
  });

  it('parses migration and read-only verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, ...files]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
    for (const sql of files) expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
  });
});
