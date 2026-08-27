import { supabase } from '../lib/supabase/client';
import { currentCompanyId, expectData } from './query';

function isMissingSchemaObject(error: any) {
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error?.code);
}

export const billingService = {
  async isAvailable() {
    try {
      await Promise.all([
        expectData<any[]>(supabase.from('invoices').select('id').limit(0), { service: 'billingService', operation: 'Detectar facturación' }),
        expectData<any[]>(supabase.from('work_orders').select('office_validation_status').limit(0), { service: 'billingService', operation: 'Detectar validación de oficina' }),
      ]);
      return true;
    } catch (error) {
      if (isMissingSchemaObject(error)) return false;
      throw error;
    }
  },
  async invoiceableWorkOrders() {
    const companyId = await currentCompanyId();
    let query = supabase.from('work_orders').select('id,company_id,code,title,client_id,sale_amount,economic_status,office_validation_status,clients!work_orders_client_id_fkey(id,code,legal_name)').eq('economic_status', 'pendiente_facturar').eq('office_validation_status', 'validated').is('deleted_at', null).gt('sale_amount', 0).order('finished_at', { ascending: true });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query, { service: 'billingService', operation: 'Listar partes facturables' });
  },
  async invoices() {
    const companyId = await currentCompanyId();
    let query = supabase.from('invoices').select('*, clients(id,code,legal_name), invoice_work_orders(*, work_orders(id,code,title,economic_status)), invoice_payments(*)').order('issue_date', { ascending: false }).order('created_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    const rows = await expectData<any[]>(query, { service: 'billingService', operation: 'Listar facturas' });
    return rows.map((row) => ({ ...row, invoice_payments: (row.invoice_payments ?? []).sort((a: any, b: any) => String(b.paid_at).localeCompare(String(a.paid_at))) }));
  },
  createInvoice(workOrderId: string, payload: { tax_rate: number; due_date?: string; notes?: string }) {
    return expectData<string>(supabase.rpc('dmp_create_invoice_from_work_order', { p_work_order_id: workOrderId, p_tax_rate: payload.tax_rate, p_due_date: payload.due_date || null, p_notes: payload.notes || null }), { service: 'billingService', operation: 'Emitir factura', resource: workOrderId });
  },
  recordPayment(invoiceId: string, payload: { amount: number; paid_at: string; method: string; reference?: string; notes?: string }) {
    return expectData<string>(supabase.rpc('dmp_record_invoice_payment', { p_invoice_id: invoiceId, p_amount: payload.amount, p_paid_at: payload.paid_at, p_method: payload.method, p_reference: payload.reference || null, p_notes: payload.notes || null }), { service: 'billingService', operation: 'Registrar cobro', resource: invoiceId });
  },
  reversePayment(paymentId: string, reason: string) {
    return expectData<void>(supabase.rpc('dmp_reverse_invoice_payment', { p_payment_id: paymentId, p_reason: reason }), { service: 'billingService', operation: 'Anular cobro', resource: paymentId });
  },
  cancelInvoice(invoiceId: string, reason: string) {
    return expectData<void>(supabase.rpc('dmp_cancel_invoice', { p_invoice_id: invoiceId, p_reason: reason }), { service: 'billingService', operation: 'Cancelar factura', resource: invoiceId });
  },
};
