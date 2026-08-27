import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

const migrations = [72, 73, 74, 75].map((number) => {
  const names: Record<number, string> = {
    72: '072_quote_immutable_canonical_integrity.sql',
    73: '073_office_validation_and_additional_sales.sql',
    74: '074_invoicing_and_collections.sql',
    75: '075_material_stock_write_boundary.sql',
  };
  return readFileSync(new URL(`../../supabase/migrations/${names[number]}`, import.meta.url), 'utf8');
});
const preflight = readFileSync(new URL('../../supabase/verification/preflight_audit_remediation_071_075.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_audit_remediation_071_075.sql', import.meta.url), 'utf8');

describe('audit remediation migrations 072-075', () => {
  it('are parseable PostgreSQL migrations', async () => {
    for (const migration of migrations) {
      const parser = await pgQuery();
      expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    }
    const preflightParser = await pgQuery();
    expect(preflightParser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    const postflightParser = await pgQuery();
    expect(postflightParser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps preflight read-only and runnable before billing tables exist', () => {
    expect(preflight.toLowerCase()).not.toContain('insert into');
    expect(preflight.toLowerCase()).not.toContain('update ');
    expect(preflight.toLowerCase()).not.toContain('delete from');
    expect(preflight).toContain("to_regclass('public.invoices')");
    expect(preflight).not.toContain('public.invoice_work_orders');
  });

  it('does not read columns that 073 creates during its own backfill', () => {
    expect(preflight).not.toContain("e.source='manual'");
    expect(preflight).not.toContain('e.contributes_to_sale');
    expect(preflight).toContain('candidatos al backfill conservador');
    expect(preflight).toContain('w.quote_id is not null');
  });

  it('declares the consolidated CTE contracts and preserves five homogeneous columns', () => {
    expect(preflight).toContain('with checks(check_group, check_name, status, affected_rows, details) as (');
    expect(preflight).toContain('summary(check_group, check_name, status, affected_rows, details) as (');
    expect(preflight).toContain('select check_group, check_name, status, affected_rows, details');
    expect(preflight).toContain('count(*)::bigint');
    expect(preflight).not.toMatch(/from\s+public\.work_order_materials[^\n]*\.(source|contributes_to_sale)/i);
    expect(preflight).not.toContain('public.invoice_work_orders');
    expect(preflight).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/i);
  });

  it('does not classify a terminal legacy line without a version as an invalid reference', () => {
    const invalidRateCheck = preflight.match(/'invalid_rate_reference'[\s\S]*?\n\s+union all select '072'/)?.[0] ?? '';
    const snapshotCheck = preflight.match(/'incomplete_canonical_snapshot'[\s\S]*?\n\s+union all select '072'/)?.[0] ?? '';
    expect(invalidRateCheck).toContain('l.rate_version_id is not null and');
    expect(snapshotCheck).not.toContain('rate_version_id is null or');
    expect(snapshotCheck).toContain('quantity is null');
    expect(snapshotCheck).toContain('total_price is null');
    expect(preflight).toContain("'legacy_lines_without_rate_version'");
    expect(preflight).toContain("q.status in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado')");
    expect(preflight).toContain("q.status not in ('Aceptado','Ejecutado en cliente','Rechazado','Caducado','Cancelado')");
  });

  it('blocks incomplete technical close and requires office validation', () => {
    expect(migrations[1]).toContain('cierre incompleto: quedan % concepto(s) previstos');
    expect(migrations[1]).toContain("economic_status='pendiente_validacion'");
    expect(migrations[1]).toContain('dmp_review_work_order_office');
    expect(migrations[1]).toContain("office_validation_status='validated'");
  });

  it('guards every historical quote header and economic snapshot field', () => {
    expect(migrations[0]).toContain('before update of company_id, code, opportunity_id, client_id, site_id');
    expect(migrations[0]).toContain('subtotal_cost,');
    expect(migrations[0]).toContain('taxable_base, tax_amount, total,');
    expect(migrations[0]).toContain('total_amount, estimated_margin, conditions, sent_at, sent_to_email');
  });

  it('includes materials and hours in explicit additional sales', () => {
    expect(migrations[1]).toContain("source='additional' and contributes_to_sale");
    expect(migrations[1]).toContain('material_additional_sale');
    expect(migrations[1]).toContain('time_additional_sale');
  });

  it('implements invoice, payment, reversal and cancellation lifecycle', () => {
    expect(migrations[2]).toContain('create table if not exists public.invoices');
    expect(migrations[2]).toContain('dmp_create_invoice_from_work_order');
    expect(migrations[2]).toContain('dmp_record_invoice_payment');
    expect(migrations[2]).toContain('dmp_reverse_invoice_payment');
    expect(migrations[2]).toContain('dmp_cancel_invoice');
  });

  it('removes direct stock quantity update authority', () => {
    expect(migrations[3]).toContain('revoke update on table public.materials from authenticated');
    expect(migrations[3]).not.toMatch(/grant update\([^)]*stock_quantity/);
    expect(migrations[3]).toContain('Stock inicial al crear material');
  });
});
