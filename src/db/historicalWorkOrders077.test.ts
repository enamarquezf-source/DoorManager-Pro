import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/077_compatibilize_historical_work_orders_with_office_validation.sql');
const preflight = read('../../supabase/verification/preflight_historical_work_orders_077.sql');
const postflight = read('../../supabase/verification/postflight_historical_work_orders_077.sql');

describe('077 historical work order compatibility', () => {
  it('parses migration, preflight and postflight SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, preflight, postflight]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('requires the audit insert to consume the candidates CTE explicitly', () => {
    const auditInsert = migration.match(/insert into public\.audit_log[\s\S]*?from candidates c;/i)?.[0] ?? '';
    expect(auditInsert).toContain('select c.company_id');
    expect(auditInsert).toMatch(/from\s+candidates\s+c\s*;/i);
    expect((migration.match(/from\s+candidates\s+c/gi) ?? []).length).toBe(2);
  });

  it('normalizes only terminal, unbilled historical parts and keeps the flow canonical', () => {
    expect(migration).toContain("w.status in ('Finalizado tecnicamente','Enviado','Cerrado')");
    expect(migration).toContain("w.office_validation_status='not_started'");
    expect(migration).not.toContain('estimated_sale_amount=');
    expect(migration).not.toContain('sale_amount=');
    expect(migration).toContain('coalesce(w.paid_amount,0)=0');
    expect(migration).toContain("not exists (select 1 from public.invoice_work_orders");
    expect(migration).toContain('v_work.status not in');
    expect(migration).toContain("'OFFICE_VALIDATE'");
    expect(migration).toContain("'OFFICE_REJECT'");
    expect(migration).toContain("'UPDATE'");
    expect(migration).toContain('begin;');
    expect(migration).toContain('commit;');
    expect(migration).not.toContain('create invoice');
    expect(migration).not.toContain('delete from public.work_orders');
    expect(migration).not.toContain('dmp_adjust_material_stock');
    expect(migration).not.toContain('invoice_payments');
    expect(migration).not.toContain('invoice_work_orders l where l.work_order_id=w.id and l.deleted_at is null) insert');
  });

  it('preserves non-billable semantics, protects invoices/tenants and verifies idempotence conditions', () => {
    expect(migration).toContain("then 'garantia'");
    expect(migration).toContain("then 'no_facturable'");
    expect(migration).toContain("w.economic_status not in ('facturado','cobrado')");
    expect(preflight).toContain('historical_not_started');
    expect(preflight).toContain('historical_zero_sale');
    expect(preflight).toContain('historical_estimated_only');
    expect(preflight).toContain('historical_no_billable_amount');
    expect(preflight).toContain('dmp_create_invoice_from_work_order(uuid,numeric,date,text)');
    expect(preflight).toContain('terminal_paid');
    expect(preflight).toContain('invoice_tenant_mismatch');
    expect(preflight).toContain('invoice_duplicates');
    expect(postflight).toContain("'postcheck_077'");
    expect(postflight).toContain('historical_billable_orphans');
    expect(postflight).toContain('invoice_tenant_mismatch');
    expect(postflight).toContain('warranty_preserved');
    expect(postflight).toContain('non_billable_preserved');
    expect(postflight).toContain('ambiguous_amounts');
    for (const sql of [preflight, postflight]) expect(sql.toLowerCase()).not.toMatch(/(^|\n)\s*(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke)\b/);
    expect(postflight).toContain('from (select * from checks union all select * from summary) result');
  });
});
