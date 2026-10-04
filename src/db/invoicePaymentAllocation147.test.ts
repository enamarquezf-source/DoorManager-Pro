import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allocateInvoicePaidAmount } from '../shared/invoicePaymentAllocation';

const migration = readFileSync(new URL('../../supabase/migrations/147_multi_work_order_invoice_payment_allocation.sql', import.meta.url), 'utf8');

describe('migration 147 multi-work-order invoice payment allocation', () => {
  it('preserves invoice paid totals and recalculates after zero or reversed payments', () => {
    expect(migration).toContain('sum(amount)');
    expect(migration).toContain('reversed_at is null');
    expect(migration).toContain('update public.invoices');
    expect(migration).toContain('v_paid_net');
    expect(allocateInvoicePaidAmount(1000, 1210, 0, [{ workOrderId: 'a', netAmount: 1000 }])).toEqual([{ workOrderId: 'a', paidAmount: 0 }]);
  });

  it('allocates one work order, partial payments and full payments consistently', () => {
    expect(allocateInvoicePaidAmount(100, 121, 60.5, [{ workOrderId: 'a', netAmount: 100 }])).toEqual([{ workOrderId: 'a', paidAmount: 50 }]);
    expect(allocateInvoicePaidAmount(100, 121, 121, [{ workOrderId: 'a', netAmount: 100 }])).toEqual([{ workOrderId: 'a', paidAmount: 100 }]);
  });

  it('distributes two work orders proportionally and assigns rounding remainder deterministically', () => {
    const result = allocateInvoicePaidAmount(100, 121, 121, [{ workOrderId: 'b', netAmount: 70 }, { workOrderId: 'a', netAmount: 30 }]);
    expect(result).toEqual([{ workOrderId: 'a', paidAmount: 30 }, { workOrderId: 'b', paidAmount: 70 }]);
    expect(result.reduce((sum, row) => sum + row.paidAmount, 0)).toBe(100);
  });

  it('allocates only the linked fraction of a hybrid invoice payment', () => {
    const result = allocateInvoicePaidAmount(100, 121, 60.5, [{ workOrderId: 'a', netAmount: 60 }]);
    expect(result).toEqual([{ workOrderId: 'a', paidAmount: 30 }]);
  });

  it('does not allocate manual invoice lines to work orders', () => {
    const result = allocateInvoicePaidAmount(100, 121, 121, [{ workOrderId: 'a', netAmount: 60 }, { workOrderId: 'b', netAmount: 40 }]);
    expect(result.reduce((sum, row) => sum + row.paidAmount, 0)).toBe(100);
    expect(migration).toContain('work_order_id is not null');
    expect(migration).toContain('work_order_id is null');
    expect(migration).toContain('public.invoice_work_orders');
    expect(migration).not.toContain('invoice_lines');
    expect(migration).not.toContain('least(v_paid_net,v_linked_net)');
  });

  it('keeps numeric allocation and reversal recalculation in the SQL contract', () => {
    expect(migration).toContain('numeric');
    expect(migration).toContain('round(');
    expect(migration).toContain('for update');
    expect(migration).toContain('v_invoice_net');
    expect(migration).toContain('v_manual_net');
    expect(migration).toContain('v_linked_paid_net');
    expect(migration).toContain('v_paid_net*v_linked_net/v_invoice_net');
    expect(migration).not.toContain('dmp024_active_profile()');
    expect(migration).not.toContain('assert_member_of_current_company(v_invoice.company_id)');
    expect(migration).toContain('revoke all on function public.dmp_refresh_invoice_collection(uuid) from public,anon,authenticated');
    expect(migration).toContain('v_amount:=0');
    expect(migration).toContain('paid_amount=v_amount');
    expect(migration).toContain('w.company_id=v_invoice.company_id');
    expect(migration).toContain('for update');
    expect(allocateInvoicePaidAmount(100, 121, 121, [{ workOrderId: 'a', netAmount: 0 }, { workOrderId: 'b', netAmount: 0 }])).toEqual([{ workOrderId: 'a', paidAmount: 0 }, { workOrderId: 'b', paidAmount: 0 }]);
  });
});
