import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/079_invoice_draft_detail_and_idempotent_prepare.sql');
const preflight = read('../../supabase/verification/preflight_invoice_draft_detail_079.sql');
const postflight = read('../../supabase/verification/postflight_invoice_draft_detail_079.sql');
const service = read('../services/billingService.ts');
const module = read('../modules/BillingModule.tsx');

describe('079 invoice draft detail', () => {
  it('parses migration and read-only checks', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('makes prepare idempotent and keeps estimation out of fiscal amounts', () => {
    expect(migration).toContain("if v_existing_status='borrador' then return v_existing");
    expect(migration).toContain('work_order_id=v_work.id and l.deleted_at is null for update');
    expect(migration).toContain('quote_lines');
    expect(migration).toContain('work_order_materials');
    expect(migration).toContain('work_order_time_entries');
    expect(migration).toContain('work_order_cost_entries');
    expect(migration).toContain('ADVERTENCIA: El importe registrado no dispone de desglose economico completo');
    expect(migration).not.toContain('estimated_sale_amount=');
    expect(service).toContain('Este parte ya tiene un borrador de factura. Se abrirá el borrador existente.');
    expect(service).toContain('code: raw?.code');
    expect(service).toContain('operation, resource');
  });

  it('exposes full context, editable concepts and responsive totals', () => {
    for (const label of ['DATOS DE FACTURACIÓN', 'CENTRO DEL TRABAJO', 'PARTE', 'TÉCNICOS']) expect(module).toContain(label);
    for (const label of ['Añadir línea', 'Eliminar línea', 'Base imponible', 'IVA:', 'Total:']) expect(module).toContain(label);
    expect(module).toContain('getWorkOrderFullDetail');
    expect(module).toContain('invoice-draft-modal');
  });

  it('verifies ambiguous amounts, tenant isolation, no payments and no stock', () => {
    expect(preflight).toContain('candidate_estimated_only');
    expect(preflight).toContain('candidate_without_amount');
    expect(preflight).toContain('invoice_tenant_mismatch');
    expect(postflight).toContain('drafts_with_payments');
    expect(postflight).toContain('postcheck_079');
    for (const sql of [preflight, postflight]) expect(sql.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
    expect(postflight).toContain('from (select * from checks union all select * from summary) result');
    expect(migration).not.toContain('invoice_payments');
    expect(migration).not.toContain('dmp_adjust_material_stock');
  });
});
