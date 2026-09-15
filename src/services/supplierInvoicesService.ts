import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';
import { supplierPaymentSummary } from './supplierPaymentsService';

export const supplierInvoiceStatuses = ['draft', 'registered', 'cancelled'] as const;
export type SupplierInvoiceStatus = typeof supplierInvoiceStatuses[number];

const context = (operation: string, resource?: string) => ({ service: 'supplierInvoicesService', operation, resource });
const clean = (value: unknown) => value === '' || value === undefined ? null : value;

export const supplierInvoicesService = {
  async list(search = '', status?: SupplierInvoiceStatus) {
    let query = supabase.from('supplier_invoices').select('*,suppliers(id,name,tax_id),supplier_invoice_lines(id,description,quantity,unit_price,net_amount,tax_amount,total_amount),supplier_invoice_allocations(id,purchase_order_id,purchase_receipt_id,allocated_amount),supplier_invoice_payments(id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_at,created_by,reversed_at,reversed_by,reversal_reason)').order('invoice_date', { ascending: false }).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['code', 'supplier_invoice_number', 'status'], search));
    if (status) query = query.eq('status', status);
    const rows = await expectData<any[]>(query, context('list supplier invoices'));
    return rows.map((row) => ({ ...row, payment_summary: supplierPaymentSummary(row) }));
  },
  async get(id: string) {
    const invoice = await expectData<any>(supabase.from('supplier_invoices').select('*,suppliers(id,name,tax_id,email,payment_terms_days,currency_code),supplier_invoice_lines(*,materials(id,code,description,unit)),supplier_invoice_allocations(*,purchase_orders(id,code,supplier_id),purchase_order_lines(id,material_description_snapshot,unit_purchase_price),purchase_receipts(id,code,receipt_date,supplier_id),purchase_receipt_lines(id,description_snapshot,received_quantity,actual_unit_cost)),supplier_invoice_payments(id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_at,created_by,reversed_at,reversed_by,reversal_reason)').eq('id', id).maybeSingle(), context('get supplier invoice', id));
    if (!invoice) throw new Error('No se ha encontrado la factura de proveedor solicitada.');
    return { ...invoice, payment_summary: supplierPaymentSummary(invoice) };
  },
  async candidates(supplierId: string) {
    const orders = await expectData<any[]>(supabase.from('purchase_orders').select('id,code,supplier_id,purchase_order_lines(id,material_description_snapshot,ordered_quantity,unit_purchase_price),purchase_receipts(id,code,status,purchase_receipt_lines(id,purchase_order_line_id,description_snapshot,received_quantity,actual_unit_cost))').eq('supplier_id', supplierId).order('order_date', { ascending: false }), context('list supplier invoice candidates', supplierId));
    return orders ?? [];
  },
  async createDraft(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    const created_by = await currentProfileId();
    if (!company_id || !payload.supplier_id) throw new Error('Selecciona un proveedor.');
    const code = await expectData<string>(supabase.rpc('next_dmp_code', { p_company_id: company_id, p_table_name: 'supplier_invoices', p_prefix: 'FPR', p_yearly: true, p_width: 6 }), context('generate supplier invoice code'));
    return expectData<any>(supabase.from('supplier_invoices').insert({ company_id, code, supplier_id: payload.supplier_id, supplier_invoice_number: clean(payload.supplier_invoice_number), invoice_date: payload.invoice_date || new Date().toISOString().slice(0, 10), due_date: clean(payload.due_date), currency_code: payload.currency_code || 'EUR', notes: clean(payload.notes), created_by, updated_by: created_by }).select().single(), context('create supplier invoice'));
  },
  updateDraft(id: string, payload: Record<string, any>) {
    return currentProfileId().then((updated_by) => expectData<any>(supabase.from('supplier_invoices').update({ supplier_id: payload.supplier_id, supplier_invoice_number: clean(payload.supplier_invoice_number), invoice_date: payload.invoice_date, due_date: clean(payload.due_date), currency_code: payload.currency_code || 'EUR', notes: clean(payload.notes), updated_by }).eq('id', id).select().single(), context('update supplier invoice', id)));
  },
  addLine(invoiceId: string, payload: Record<string, any>) {
    return currentCompanyId().then((company_id) => expectData<any>(supabase.from('supplier_invoice_lines').insert({ company_id, supplier_invoice_id: invoiceId, description: payload.description, material_id: clean(payload.material_id), quantity: Number(payload.quantity), unit_price: Number(payload.unit_price), tax_rate: Number(payload.tax_rate ?? 21) }).select().single(), context('add supplier invoice line', invoiceId)));
  },
  removeLine(id: string) { return expectData<any>(supabase.from('supplier_invoice_lines').delete().eq('id', id), context('remove supplier invoice line', id)); },
  addAllocation(invoiceId: string, payload: Record<string, any>) {
    return Promise.all([currentCompanyId(), currentProfileId()]).then(([company_id, created_by]) => expectData<any>(supabase.from('supplier_invoice_allocations').insert({ company_id, created_by, supplier_invoice_id: invoiceId, supplier_invoice_line_id: payload.supplier_invoice_line_id, purchase_order_id: clean(payload.purchase_order_id), purchase_order_line_id: clean(payload.purchase_order_line_id), purchase_receipt_id: clean(payload.purchase_receipt_id), purchase_receipt_line_id: clean(payload.purchase_receipt_line_id), allocated_quantity: payload.allocated_quantity == null || payload.allocated_quantity === '' ? null : Number(payload.allocated_quantity), allocated_amount: Number(payload.allocated_amount) }).select().single(), context('allocate supplier invoice', invoiceId)));
  },
  removeAllocation(id: string) { return expectData<any>(supabase.from('supplier_invoice_allocations').delete().eq('id', id), context('remove supplier invoice allocation', id)); },
  register(id: string) { return expectData<any>(supabase.rpc('dmp_register_supplier_invoice', { p_supplier_invoice_id: id }), context('register supplier invoice', id)); },
  cancel(id: string, reason: string) { return expectData<any>(supabase.rpc('dmp_cancel_supplier_invoice', { p_supplier_invoice_id: id, p_reason: reason }), context('cancel supplier invoice', id)); },
};
