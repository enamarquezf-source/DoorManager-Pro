import { supabase } from '../lib/supabase/client';
import { expectData } from './query';

const context = (operation: string, resource?: string) => ({ service: 'purchaseReceiptsService', operation, resource });
const clean = (value: unknown) => value === '' || value === undefined ? null : value;

export const purchaseReceiptStatuses = ['draft', 'confirmed', 'cancelled'] as const;
export type PurchaseReceiptStatus = typeof purchaseReceiptStatuses[number];

export const purchaseReceiptsService = {
  async listForOrder(purchaseOrderId: string) {
    return expectData<any[]>(supabase.from('purchase_receipts').select('*,warehouses(id,code,name),suppliers(id,name),profiles!purchase_receipts_created_by_fkey(id,first_name,last_name),purchase_receipt_lines(*)').eq('purchase_order_id', purchaseOrderId).order('receipt_date', { ascending: false }), context('list purchase receipts', purchaseOrderId));
  },
  async get(id: string) {
    const receipt = await expectData<any>(supabase.from('purchase_receipts').select('*,warehouses(id,code,name),suppliers(id,name),profiles!purchase_receipts_created_by_fkey(id,first_name,last_name)').eq('id', id).maybeSingle(), context('get purchase receipt', id));
    if (!receipt) throw new Error('No se ha encontrado la recepción solicitada.');
    const lines = await expectData<any[]>(supabase.from('purchase_receipt_lines').select('*').eq('purchase_receipt_id', id).order('created_at'), context('get purchase receipt lines', id));
    return { ...receipt, purchase_receipt_lines: lines ?? [] };
  },
  createDraft(orderId: string, payload: Record<string, any>) { return expectData<any>(supabase.rpc('dmp_create_purchase_receipt', { p_purchase_order_id: orderId, p_receipt_date: clean(payload.receipt_date), p_warehouse_id: payload.warehouse_id, p_supplier_document_reference: clean(payload.supplier_document_reference), p_notes: clean(payload.notes) }), context('create purchase receipt', orderId)); },
  updateDraft(id: string, payload: Record<string, any>) { return expectData<any>(supabase.rpc('dmp_update_purchase_receipt', { p_receipt_id: id, p_receipt_date: clean(payload.receipt_date), p_warehouse_id: payload.warehouse_id, p_supplier_document_reference: clean(payload.supplier_document_reference), p_notes: clean(payload.notes) }), context('update purchase receipt', id)); },
  addLine(receiptId: string, payload: Record<string, any>) { return expectData<any>(supabase.rpc('dmp_add_purchase_receipt_line', { p_receipt_id: receiptId, p_purchase_order_line_id: payload.purchase_order_line_id, p_received_quantity: Number(payload.received_quantity), p_actual_unit_cost: clean(payload.actual_unit_cost) === null ? null : Number(payload.actual_unit_cost) }), context('add purchase receipt line', receiptId)); },
  updateLine(id: string, payload: Record<string, any>) { return expectData<any>(supabase.rpc('dmp_update_purchase_receipt_line', { p_receipt_line_id: id, p_received_quantity: Number(payload.received_quantity), p_actual_unit_cost: clean(payload.actual_unit_cost) === null ? null : Number(payload.actual_unit_cost) }), context('update purchase receipt line', id)); },
  removeLine(id: string) { return expectData<any>(supabase.rpc('dmp_remove_purchase_receipt_line', { p_receipt_line_id: id }), context('remove purchase receipt line', id)); },
  confirm(id: string) { return expectData<any>(supabase.rpc('dmp_confirm_purchase_receipt', { p_receipt_id: id }), context('confirm purchase receipt', id)); },
  cancelDraft(id: string) { return expectData<any>(supabase.rpc('dmp_cancel_draft_purchase_receipt', { p_receipt_id: id }), context('cancel purchase receipt', id)); },
};
