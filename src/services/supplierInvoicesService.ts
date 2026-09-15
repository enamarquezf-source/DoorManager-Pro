import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';
import { supplierPaymentSummary } from './supplierPaymentsService';

export const supplierInvoiceStatuses = ['draft', 'registered', 'cancelled'] as const;
export type SupplierInvoiceStatus = typeof supplierInvoiceStatuses[number];

const context = (operation: string, resource?: string) => ({ service: 'supplierInvoicesService', operation, resource });
const clean = (value: unknown) => value === '' || value === undefined ? null : value;
const loadByIds = async (table: string, ids: string[], columns: string, operation: string) => ids.length ? expectData<any[]>(supabase.from(table).select(columns).in('id', ids), context(operation)) : [];

export const supplierInvoicesService = {
  async list(search = '', status?: SupplierInvoiceStatus) {
    let query = supabase.from('supplier_invoices').select('*,suppliers(id,name,tax_id),supplier_invoice_lines(id,description,quantity,unit_price,net_amount,tax_amount,total_amount),supplier_invoice_allocations(id,purchase_order_id,purchase_receipt_id,allocated_amount),supplier_invoice_payments(id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_at,created_by,reversed_at,reversed_by,reversal_reason)').order('invoice_date', { ascending: false }).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['code', 'supplier_invoice_number', 'status'], search));
    if (status) query = query.eq('status', status);
    const rows = await expectData<any[]>(query, context('list supplier invoices'));
    return rows.map((row) => ({ ...row, payment_summary: supplierPaymentSummary(row) }));
  },
  async get(id: string) {
    const invoice = await expectData<any>(supabase.from('supplier_invoices').select('*').eq('id', id).maybeSingle(), context('get supplier invoice header', id));
    if (!invoice) throw new Error('No se ha encontrado la factura de proveedor solicitada.');
    const [supplier, lines, allocations, payments] = await Promise.all([
      expectData<any>(supabase.from('suppliers').select('id,name,tax_id,email,payment_terms_days,currency_code').eq('id', invoice.supplier_id).maybeSingle(), context('get supplier invoice supplier', id)),
      expectData<any[]>(supabase.from('supplier_invoice_lines').select('*').eq('supplier_invoice_id', id).order('created_at'), context('get supplier invoice lines', id)),
      expectData<any[]>(supabase.from('supplier_invoice_allocations').select('*').eq('supplier_invoice_id', id).order('created_at'), context('get supplier invoice allocations', id)),
      expectData<any[]>(supabase.from('supplier_invoice_payments').select('id,supplier_invoice_id,payment_date,amount,payment_method,reference,notes,created_at,created_by,reversed_at,reversed_by,reversal_reason').eq('supplier_invoice_id', id).order('payment_date', { ascending: false }).order('created_at', { ascending: false }), context('get supplier invoice payments', id)),
    ]);
    const lineRows = lines ?? [];
    const allocationRows = allocations ?? [];
    const materialIds = [...new Set(lineRows.map((line: any) => line.material_id).filter(Boolean))];
    const orderIds = [...new Set(allocationRows.map((allocation: any) => allocation.purchase_order_id).filter(Boolean))];
    const orderLineIds = [...new Set(allocationRows.map((allocation: any) => allocation.purchase_order_line_id).filter(Boolean))];
    const receiptIds = [...new Set(allocationRows.map((allocation: any) => allocation.purchase_receipt_id).filter(Boolean))];
    const receiptLineIds = [...new Set(allocationRows.map((allocation: any) => allocation.purchase_receipt_line_id).filter(Boolean))];
    const [materials, orders, orderLines, receipts, receiptLines] = await Promise.all([
      loadByIds('materials', materialIds, 'id,code,description,unit', 'get supplier invoice materials'),
      loadByIds('purchase_orders', orderIds, 'id,code,supplier_id,internal_reference,supplier_reference', 'get supplier invoice purchase orders'),
      loadByIds('purchase_order_lines', orderLineIds, 'id,purchase_order_id,material_description_snapshot,unit_purchase_price', 'get supplier invoice purchase order lines'),
      loadByIds('purchase_receipts', receiptIds, 'id,code,receipt_date,supplier_id,status', 'get supplier invoice purchase receipts'),
      loadByIds('purchase_receipt_lines', receiptLineIds, 'id,purchase_receipt_id,purchase_order_line_id,description_snapshot,received_quantity,actual_unit_cost', 'get supplier invoice purchase receipt lines'),
    ]);
    const byId = (rows: any[]) => new Map((rows ?? []).map((row) => [row.id, row]));
    const materialById = byId(materials); const orderById = byId(orders); const orderLineById = byId(orderLines); const receiptById = byId(receipts); const receiptLineById = byId(receiptLines);
    return {
      ...invoice,
      suppliers: supplier,
      supplier_invoice_lines: lineRows.map((line: any) => ({ ...line, materials: materialById.get(line.material_id) ?? null })),
      supplier_invoice_allocations: allocationRows.map((allocation: any) => ({ ...allocation, purchase_orders: orderById.get(allocation.purchase_order_id) ?? null, purchase_order_lines: orderLineById.get(allocation.purchase_order_line_id) ?? null, purchase_receipts: receiptById.get(allocation.purchase_receipt_id) ?? null, purchase_receipt_lines: receiptLineById.get(allocation.purchase_receipt_line_id) ?? null })),
      supplier_invoice_payments: payments ?? [],
      payment_summary: supplierPaymentSummary({ ...invoice, supplier_invoice_payments: payments ?? [] }),
    };
  },
  async purchaseOrderContext(orderId: string) {
    const order = await expectData<any>(supabase.from('purchase_orders').select('id,code,supplier_id,internal_reference,supplier_reference,notes').eq('id', orderId).maybeSingle(), context('get supplier invoice source purchase order', orderId));
    if (!order) throw new Error('No se ha encontrado el pedido de compra solicitado.');
    const [lines, receipts] = await Promise.all([
      expectData<any[]>(supabase.from('purchase_order_lines').select('id,material_id,material_description_snapshot,unit_snapshot,ordered_quantity,unit_purchase_price').eq('purchase_order_id', orderId).order('created_at'), context('get supplier invoice source order lines', orderId)),
      expectData<any[]>(supabase.from('purchase_receipts').select('id,code,status,receipt_date,supplier_id').eq('purchase_order_id', orderId).order('receipt_date', { ascending: false }), context('get supplier invoice source receipts', orderId)),
    ]);
    const receiptRows = receipts ?? [];
    const receiptIds = receiptRows.map((receipt: any) => receipt.id);
    const receiptLines = await (receiptIds.length ? expectData<any[]>(supabase.from('purchase_receipt_lines').select('id,purchase_receipt_id,purchase_order_line_id,description_snapshot,received_quantity,actual_unit_cost').in('purchase_receipt_id', receiptIds), context('get supplier invoice source receipt lines', orderId)) : []);
    return { ...order, purchase_order_lines: lines ?? [], purchase_receipts: receiptRows.map((receipt: any) => ({ ...receipt, purchase_receipt_lines: (receiptLines ?? []).filter((line: any) => line.purchase_receipt_id === receipt.id) })) };
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
