import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';
import type { ArchiveFilter } from './entityLifecycleService';

export type MaterialFilter = ArchiveFilter | 'inactive' | 'consumed' | 'all';

const materialColumns = ['company_id', 'code', 'description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'minimum_stock', 'stock_controlled', 'allow_negative_stock', 'is_specific', 'active'];
const materialUpdateColumns = ['description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'minimum_stock', 'stock_controlled', 'allow_negative_stock', 'is_specific', 'active'];

function cleanPayload(payload: Record<string, any>, columns = materialColumns) {
  return Object.fromEntries(columns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

function normalizeMaterial(payload: Record<string, any>, columns = materialColumns) {
  const next = cleanPayload(payload, columns);
  for (const key of ['cost', 'price', 'minimum_stock', 'initial_quantity']) if (key in next) next[key] = Number(next[key] ?? 0);
  if ('active' in next) next.active = next.active === true || next.active === 'true' || next.active === 'Activo';
  if ('stock_controlled' in next) next.stock_controlled = next.stock_controlled === true || next.stock_controlled === 'true';
  if ('allow_negative_stock' in next) next.allow_negative_stock = next.allow_negative_stock === true || next.allow_negative_stock === 'true';
  if ('is_specific' in next) next.is_specific = next.is_specific === true || next.is_specific === 'true';
  return next;
}

export const materialsService = {
  async list(search = '', companyScope?: string | null, archiveFilter: MaterialFilter = 'active') {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('materials').select('id,company_id,code,description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled,allow_negative_stock,is_specific,active,deleted_at');
    if (archiveFilter === 'active') query = query.is('deleted_at', null).eq('active', true);
    if (archiveFilter === 'inactive') query = query.is('deleted_at', null).eq('active', false).eq('is_specific', false);
    if (archiveFilter === 'consumed') query = query.is('deleted_at', null).eq('active', false).eq('is_specific', true);
    if (archiveFilter === 'archived') query = query.or('active.eq.false,deleted_at.not.is.null');
    query = query.order('description');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'description', 'manufacturer', 'reference', 'unit'], search));
    return expectData<any[]>(query, { service: 'materialsService', operation: 'list materials' });
  },
  async initialStockCatalog() {
    const companyId = await currentCompanyId();
    let query = supabase.from('materials').select('id,company_id,code,description,manufacturer,reference,unit,cost,price,minimum_stock,stock_controlled,allow_negative_stock,is_specific,active,deleted_at').is('deleted_at', null).order('description');
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query, { service: 'materialsService', operation: 'list initial stock materials' });
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    try {
      return await expectData<any>(supabase.rpc('dmp_create_material_with_stock', { p_payload: { ...normalizeMaterial(payload, [...materialColumns, 'initial_quantity', 'warehouse_id']), company_id } }), { service: 'materialsService', operation: 'create material' });
    } catch (error: any) {
      if (['42883', 'PGRST202'].includes(error?.code)) throw new Error('Creación de materiales pendiente de activación del backend de stock.');
      throw error;
    }
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('materials').update(normalizeMaterial(payload, materialUpdateColumns)).eq('id', id).select().maybeSingle(), { service: 'materialsService', operation: 'update material', resource: id });
  },
  deactivate(id: string) {
    return expectData<any>(supabase.from('materials').update({ active: false, deleted_at: new Date().toISOString() }).eq('id', id).select().maybeSingle(), { service: 'materialsService', operation: 'deactivate material', resource: id });
  },
  reactivate(id: string) {
    return expectData<any>(supabase.from('materials').update({ active: true, deleted_at: null, deleted_by: null, delete_reason: null }).eq('id', id).select().maybeSingle(), { service: 'materialsService', operation: 'reactivate material', resource: id });
  },
  movements(materialId: string) {
    const movements = supabase.from('stock_movements').select('id,movement_type,quantity,warehouse_id,material_id,work_order_id,created_at,notes,idempotency_key,warehouses!stock_movements_warehouse_id_fkey(code,name),profiles!stock_movements_created_by_fkey(first_name,last_name),work_orders!stock_movements_work_order_id_fkey(id,code,title,quote_id,clients!work_orders_client_id_fkey(code,legal_name),sites!work_orders_site_id_fkey(code,name),equipment!work_orders_main_equipment_id_fkey(code),quotes!work_orders_quote_id_fkey(id,code,title))').eq('material_id', materialId).order('created_at', { ascending: false }).limit(80);
    const stock = supabase.from('warehouse_stock').select('warehouse_id,quantity').eq('material_id', materialId);
    return Promise.all([expectData<any[]>(movements, { service: 'materialsService', operation: 'list warehouse stock movements', resource: materialId }), expectData<any[]>(stock, { service: 'materialsService', operation: 'read current warehouse stock for movement history', resource: materialId })]).then(([rows, balances]) => {
      const balanceByWarehouse = new Map(balances.map((row) => [row.warehouse_id, Number(row.quantity ?? 0)]));
      return rows.map((row) => ({ ...row, current_quantity: balanceByWarehouse.get(row.warehouse_id) ?? null }));
    });
  },
  adjustStock(materialId: string, payload: { movement_type: string; quantity: number | string; reason: string; warehouse_id?: string }) {
    const warehouseId = payload.warehouse_id;
    if (!warehouseId) throw new Error('Selecciona el almacen del movimiento.');
    return expectData<number>(supabase.rpc('dmp_adjust_warehouse_stock', { p_warehouse_id: warehouseId, p_material_id: materialId, p_movement_type: payload.movement_type, p_quantity: Number(payload.quantity), p_reason: payload.reason, p_idempotency_key: crypto.randomUUID() }), { service: 'materialsService', operation: 'adjust warehouse stock', resource: materialId });
  },
};
