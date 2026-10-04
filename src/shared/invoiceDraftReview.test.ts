import { describe, expect, it } from 'vitest';
import { invoiceLineAmounts, reviewInvoiceDraft } from './invoiceDraftReview';
import { billingBlockers, isBillingEligibleWithoutOffice } from './guidedBillingEligibility';

const line = { work_order_id: 'work', quantity: 6.667, unit_price: 110, discount: 0, tax_rate: 21 };
const work = { id: 'work', sale_amount: 843.33, billable: true, economic_status: 'pendiente_facturar', economic_review_status: 'approved', sat_review_status: 'approved', sat_review_destination: 'facturacion' };
describe('draft comparison against approved economics', () => {
  it('rounds each base and tax as the database does', () => {
    expect(invoiceLineAmounts(line)).toEqual({ subtotal: 733.37, tax: 154.01, total: 887.38 });
  });
  it('explains the edited draft difference and clears a stale mismatch after correction', () => {
    const invoice = { economic_detail_status: 'inconsistent', context: { work_order: work } };
    expect(reviewInvoiceDraft(invoice, [line, { ...line, quantity: 1 }])).toEqual({ subtotal: 843.37, expected: 843.33, mismatch: true });
    expect(reviewInvoiceDraft(invoice, [{ ...line, quantity: 1, unit_price: 843.33 }]).mismatch).toBe(false);
  });
  it('detects a new difference even when the loaded draft was complete', () => {
    expect(reviewInvoiceDraft({ economic_detail_status: 'complete', context: { work_order: work } }, [line]).mismatch).toBe(true);
  });
  it('does not apply a single-part comparison to manual, hybrid or multi-part invoices', () => {
    const invoice = { economic_detail_status: 'inconsistent', context: { work_order: work } };
    for (const lines of [[{ ...line, work_order_id: null }], [line, { ...line, work_order_id: null }], [line, { ...line, work_order_id: 'other' }]]) {
      expect(reviewInvoiceDraft(invoice, lines).mismatch).toBe(false);
    }
  });
  it('retains a known inconsistency when context could not be loaded', () => {
    expect(reviewInvoiceDraft({ economic_detail_status: 'inconsistent' }, [line]).mismatch).toBe(true);
  });
});
describe('blocked billing queue', () => {
  it('accepts approved modern and validated legacy work consistently with eligibility', () => {
    for (const candidate of [work, { ...work, economic_review_status: 'not_started', office_validation_status: 'validated' }]) {
      expect(isBillingEligibleWithoutOffice(candidate)).toBe(true);
      expect(billingBlockers(candidate)).toEqual([]);
    }
  });
  it('explains legacy validation, nonbillable and unapproved sales without hiding work', () => {
    expect(billingBlockers({ ...work, economic_review_status: 'not_started' })).toContain('Parte histórico pendiente de validación de Oficina.');
    expect(billingBlockers({ ...work, billable: false })).toContain('Parte marcado como no facturable.');
    expect(billingBlockers({ ...work, sale_amount: 0 })).toContain('Falta un importe de venta aprobado mayor que cero.');
    expect(billingBlockers({ ...work, economic_review_status: 'pending' })).toContain('Revisión económica pendiente de aprobación.');
  });
  it('explains uncompleted Commercial routing', () => {
    expect(billingBlockers({ ...work, sat_review_destination: 'comercial', commercial_review_status: 'pending' })).toContain('Falta completar la revisión SAT o Comercial y enviarlo a Facturación.');
  });
});
