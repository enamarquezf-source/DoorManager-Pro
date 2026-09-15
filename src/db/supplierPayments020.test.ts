import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { supplierPaymentSummary } from '../services/supplierPaymentsService';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/131_supplier_invoice_payments.sql');
const verify = read('../../supabase/verification/verify_131_supplier_invoice_payments.sql');
const service = read('../services/supplierPaymentsService.ts');
const panel = read('../modules/SupplierPaymentsPanel.tsx');
const rbac = read('../auth/rbac.ts');

describe('SUPPLIER-PAYMENTS-020', () => {
  it('parses migration and verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, verify]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('defines a separate immutable payment model with tenant-safe controls', () => {
    for (const field of ['payment_date', 'amount', 'payment_method', 'reference', 'notes', 'created_at', 'created_by', 'reversed_at', 'reversed_by', 'reversal_reason']) expect(migration).toContain(field);
    expect(migration).toContain('supplier_invoice_payments_invoice_company_fk');
    expect(migration).toContain('amount > 0');
    expect(migration).toContain('supplier_invoice_payments_reversal_check');
    expect(migration).toContain('revoke all on table public.supplier_invoice_payments from public, anon, authenticated');
    expect(migration).toContain('with check (false)');
    expect(migration).toContain('supplier_invoice_payments_active_invoice_idx');
    expect(migration).not.toContain('public.invoice_payments');
    expect(rbac).toContain("'supplier_payments.read'");
    expect(rbac).toContain("'supplier_payments.create'");
    expect(rbac).toContain("'supplier_payments.reverse'");
    expect(rbac).not.toContain("'supplier_payments.update'");
  });

  it('enforces registered-only recording, locked overpayment checks, reversal and cancellation guards', () => {
    expect(migration).toContain('where id = p_supplier_invoice_id for update');
    expect(migration).toContain("v_invoice.status <> 'registered'");
    expect(migration).toContain("nullif(trim(coalesce(p_payment_method, '')), '') is null");
    expect(migration).toContain("método no válido");
    expect(migration).toContain('round(v_paid + p_amount, 2) > v_invoice.total_amount');
    expect(migration).toContain('where id = p_payment_id and supplier_invoice_id = v_invoice.id for update');
    expect(migration).toContain('v_payment.reversed_at is not null');
    expect(migration).toContain('primero deben revertirse los pagos activos');
    expect(migration).not.toContain('delete from public.supplier_invoice_payments');
    expect(verify).toContain('public_rpcs');
    expect(verify).toContain('active_payment_guard');
    expect(verify).toContain('PAYMENT_REVERSE');
    expect(verify).not.toContain('c.conkey=ARRAY');
    expect(verify).not.toContain('c.confkey=ARRAY');
    expect(verify).toContain('table_privileges');
    expect(verify).toContain('expected_role_grants');
    expect(verify).toContain('exact_payment_policies');
  });

  it('derives payment statuses, outstanding balance and overdue independently of invoice total', () => {
    const today = new Date(2026, 8, 15);
    expect(supplierPaymentSummary({ status: 'registered', total_amount: 1000, due_date: '2026-10-01', supplier_invoice_payments: [{ amount: 1000 }] }, today)).toMatchObject({ paid_amount: 1000, outstanding_amount: 0, payment_status: 'paid', overdue: false });
    expect(supplierPaymentSummary({ status: 'registered', total_amount: 1000, due_date: '2026-10-01', supplier_invoice_payments: [{ amount: 400 }] }, today)).toMatchObject({ paid_amount: 400, outstanding_amount: 600, payment_status: 'partially_paid', overdue: false });
    expect(supplierPaymentSummary({ status: 'registered', total_amount: 1000, due_date: '2026-01-01', supplier_invoice_payments: [{ amount: 400 }] }, today)).toMatchObject({ payment_status: 'partially_paid', outstanding_amount: 600, overdue: true });
    expect(supplierPaymentSummary({ status: 'registered', total_amount: 1000, due_date: '2026-01-01', supplier_invoice_payments: [{ amount: 1000, reversed_at: '2026-01-02' }] }, today)).toMatchObject({ paid_amount: 0, outstanding_amount: 1000, payment_status: 'unpaid', overdue: true });
  });

  it('exposes summary, payment history, record and reversal actions without customer collection coupling', () => {
    for (const label of ['Total factura', 'Pagado', 'Pendiente', 'Vencimiento', 'Estado de pago', 'Registrar pago', 'Revertir pago', 'Revertido']) expect(panel).toContain(label);
    expect(service).toContain('dmp_record_supplier_payment');
    expect(service).toContain('dmp_reverse_supplier_payment');
    expect(panel).not.toContain('public.invoice_payments');
  });
});
