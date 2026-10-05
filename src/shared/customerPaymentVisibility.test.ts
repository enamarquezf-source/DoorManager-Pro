import { describe, expect, it } from 'vitest';
import { customerPaymentVisibility } from './customerPaymentVisibility';

const invoice = { id: 'invoice', status: 'emitida', paid_amount: 100, total_amount: 100 };
describe('customer collection recovery visibility', () => {
  it('keeps a fully paid invoice available solely to confirm an uncertain request', () => {
    expect(customerPaymentVisibility(invoice, true, true)).toEqual({ visibleInCollections: true, canOpenPayment: true, recovery: true });
    expect(customerPaymentVisibility(invoice, false, true)).toEqual({ visibleInCollections: false, canOpenPayment: false, recovery: false });
  });
  it('allows receipt recovery after cancellation without allowing a new collection', () => {
    expect(customerPaymentVisibility({ ...invoice, status: 'cancelada', paid_amount: 0 }, true, true).canOpenPayment).toBe(true);
    expect(customerPaymentVisibility({ ...invoice, status: 'cancelada', paid_amount: 0 }, false, true).canOpenPayment).toBe(false);
  });
  it('does not expose recovery to a profile without recording permission', () => {
    expect(customerPaymentVisibility(invoice, true, false)).toEqual({ visibleInCollections: false, canOpenPayment: false, recovery: false });
  });
  it('preserves outstanding invoice visibility and prevents collection of drafts', () => {
    expect(customerPaymentVisibility({ ...invoice, paid_amount: 25 }, false, false)).toEqual({ visibleInCollections: true, canOpenPayment: false, recovery: false });
    expect(customerPaymentVisibility({ ...invoice, status: 'borrador', paid_amount: 0 }, false, true).canOpenPayment).toBe(false);
  });
});
