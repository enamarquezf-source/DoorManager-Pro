import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

export const supplierPaymentMethods = ['transferencia', 'tarjeta', 'efectivo', 'domiciliacion', 'otro'] as const;
export type SupplierPaymentMethod = typeof supplierPaymentMethods[number];

const context = (operation: string, resource?: string) => ({ service: 'supplierPaymentsService', operation, resource });

export function supplierPaymentSummary(invoice: any, today = new Date()) {
  const payments = invoice?.supplier_invoice_payments ?? [];
  const total = Number(invoice?.total_amount ?? 0);
  const paid = payments.filter((payment: any) => !payment.reversed_at).reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
  const outstanding = Math.max(round(total - paid), 0);
  const payment_status = paid <= 0 ? 'unpaid' : outstanding <= 0 ? 'paid' : 'partially_paid';
  const due = invoice?.due_date ? new Date(`${String(invoice.due_date).slice(0, 10)}T00:00:00`) : null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { total_amount: total, paid_amount: round(paid), outstanding_amount: outstanding, payment_status, overdue: invoice?.status === 'registered' && outstanding > 0 && !!due && due < current };
}

function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

export const supplierPaymentsService = {
  async list(invoiceId: string) {
    return expectData<any[]>(supabase.from('supplier_invoice_payments').select('id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_at,created_by,reversed_at,reversed_by,reversal_reason').eq('supplier_invoice_id', invoiceId).order('payment_date', { ascending: false }).order('created_at', { ascending: false }), context('list supplier invoice payments', invoiceId));
  },
  record(invoiceId: string, payload: { amount: number; payment_date: string; payment_method: SupplierPaymentMethod; reference?: string; notes?: string; treasury_account_id: string }) {
    return expectData<string>(supabase.rpc('dmp_record_supplier_payment', { p_supplier_invoice_id: invoiceId, p_amount: payload.amount, p_payment_date: payload.payment_date, p_payment_method: payload.payment_method, p_reference: payload.reference || null, p_notes: payload.notes || null, p_treasury_account_id: payload.treasury_account_id }), context('record supplier invoice payment', invoiceId));
  },
  reverse(paymentId: string, reason: string) {
    return expectData<string>(supabase.rpc('dmp_reverse_supplier_payment', { p_payment_id: paymentId, p_reason: reason }), context('reverse supplier invoice payment', paymentId));
  },
};
