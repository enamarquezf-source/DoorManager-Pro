import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const purchaseOrderStatuses = ['draft', 'ordered', 'cancelled'] as const;
export type PurchaseOrderStatus = typeof purchaseOrderStatuses[number];

function clean(value: unknown) {
  return value === '' || value === undefined ? null : value;
}

export const purchaseOrdersService = {
  async list(filters: { search?: string; supplierId?: string; status?: string; warehouseId?: string; from?: string; to?: string } = {}) {
    const companyId = await currentCompanyId();
    let query = supabase.from('purchase_orders').select('*,suppliers(id,name),warehouses(id,code,name),profiles!purchase_orders_created_by_fkey(id,first_name,last_name)').eq('company_id', companyId).order('order_date', { ascending: false }).order('created_at', { ascending: false });
    if (filters.search) query = query.or(contains(['code', 'supplier_reference', 'status'], filters.search));
    if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.warehouseId) query = query.eq('destination_warehouse_id', filters.warehouseId);
    if (filters.from) query = query.gte('order_date', filters.from);
    if (filters.to) query = query.lte('order_date', filters.to);
    return expectData<any[]>(query, { service: 'purchaseOrdersService', operation: 'list purchase orders' });
  },
  async get(id: string) {
    const order = await expectData<any>(supabase.from('purchase_orders').select('*,suppliers(id,name,tax_id),warehouses(id,code,name),profiles!purchase_orders_created_by_fkey(id,first_name,last_name)').eq('id', id).maybeSingle(), { service: 'purchaseOrdersService', operation: 'get purchase order', resource: id });
    if (!order) throw new Error('No se ha encontrado el pedido de compra solicitado.');
    const lines = await expectData<any[]>(supabase.from('purchase_order_lines').select('*,materials(id,code,description,unit),material_suppliers(id,supplier_reference,purchase_unit_price)').eq('purchase_order_id', id).order('created_at'), { service: 'purchaseOrdersService', operation: 'get purchase order lines', resource: id });
    return { ...order, purchase_order_lines: lines ?? [] };
  },
  create(payload: Record<string, any>) {
    return currentCompanyId().then((companyId) => expectData<any>(supabase.rpc('dmp_create_purchase_order', { p_company_id: companyId, p_supplier_id: payload.supplier_id, p_order_date: clean(payload.order_date), p_destination_warehouse_id: clean(payload.destination_warehouse_id), p_supplier_reference: clean(payload.supplier_reference), p_notes: clean(payload.notes) }), { service: 'purchaseOrdersService', operation: 'create purchase order' }));
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.rpc('dmp_update_purchase_order', { p_purchase_order_id: id, p_supplier_id: payload.supplier_id, p_order_date: clean(payload.order_date), p_destination_warehouse_id: clean(payload.destination_warehouse_id), p_supplier_reference: clean(payload.supplier_reference), p_notes: clean(payload.notes) }), { service: 'purchaseOrdersService', operation: 'update purchase order', resource: id });
  },
  addLine(orderId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.rpc('dmp_add_purchase_order_line', { p_purchase_order_id: orderId, p_material_id: payload.material_id, p_material_supplier_id: clean(payload.material_supplier_id), p_ordered_quantity: Number(payload.ordered_quantity), p_unit_purchase_price: clean(payload.unit_purchase_price) === null ? null : Number(payload.unit_purchase_price) }), { service: 'purchaseOrdersService', operation: 'add purchase order line', resource: orderId });
  },
  updateLine(lineId: string, payload: Record<string, any>) {
    return expectData<any>(supabase.rpc('dmp_update_purchase_order_line', { p_line_id: lineId, p_material_id: payload.material_id, p_material_supplier_id: clean(payload.material_supplier_id), p_ordered_quantity: Number(payload.ordered_quantity), p_unit_purchase_price: clean(payload.unit_purchase_price) === null ? null : Number(payload.unit_purchase_price) }), { service: 'purchaseOrdersService', operation: 'update purchase order line', resource: lineId });
  },
  removeLine(lineId: string) {
    return expectData<any>(supabase.rpc('dmp_remove_purchase_order_line', { p_line_id: lineId }), { service: 'purchaseOrdersService', operation: 'remove purchase order line', resource: lineId });
  },
  markOrdered(id: string) {
    return expectData<any>(supabase.rpc('dmp_order_purchase_order', { p_purchase_order_id: id }), { service: 'purchaseOrdersService', operation: 'mark purchase order ordered', resource: id });
  },
  cancel(id: string) {
    return expectData<any>(supabase.rpc('dmp_cancel_purchase_order', { p_purchase_order_id: id }), { service: 'purchaseOrdersService', operation: 'cancel purchase order', resource: id });
  },
};
