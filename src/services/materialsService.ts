import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';
import type { ArchiveFilter } from './entityLifecycleService';

export type MaterialFilter = ArchiveFilter | 'inactive' | 'consumed';

const materialColumns = ['company_id', 'code', 'description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'stock_quantity', 'minimum_stock', 'stock_controlled', 'allow_negative_stock', 'is_specific', 'active'];
const materialUpdateColumns = ['description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'minimum_stock', 'stock_controlled', 'allow_negative_stock', 'is_specific', 'active'];

function cleanPayload(payload: Record<string, any>, columns = materialColumns) {
  return Object.fromEntries(columns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

function normalizeMaterial(payload: Record<string, any>, columns = materialColumns) {
  const next = cleanPayload(payload, columns);
  for (const key of ['cost', 'price', 'stock_quantity', 'minimum_stock']) if (key in next) next[key] = Number(next[key] ?? 0);
  if ('active' in next) next.active = next.active === true || next.active === 'true' || next.active === 'Activo';
  if ('stock_controlled' in next) next.stock_controlled = next.stock_controlled === true || next.stock_controlled === 'true';
  if ('allow_negative_stock' in next) next.allow_negative_stock = next.allow_negative_stock === true || next.allow_negative_stock === 'true';
  if ('is_specific' in next) next.is_specific = next.is_specific === true || next.is_specific === 'true';
  return next;
}

export const materialsService = {
  async list(search = '', companyScope?: string | null, archiveFilter: MaterialFilter = 'active') {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('materials').select('*');
    if (archiveFilter === 'active') query = query.is('deleted_at', null).eq('active', true);
    if (archiveFilter === 'inactive') query = query.is('deleted_at', null).eq('active', false).eq('is_specific', false);
    if (archiveFilter === 'consumed') query = query.is('deleted_at', null).eq('active', false).eq('is_specific', true);
    if (archiveFilter === 'archived') query = query.or('active.eq.false,deleted_at.not.is.null');
    query = query.order('description');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'description', 'manufacturer', 'reference', 'unit'], search));
    return expectData<any[]>(query, { service: 'materialsService', operation: 'list materials' });
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    try {
      return await expectData<any>(supabase.rpc('dmp_create_material_with_stock', { p_payload: { ...normalizeMaterial(payload), company_id } }), { service: 'materialsService', operation: 'create material' });
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
    return expectData<any[]>(supabase.from('material_stock_movements').select('*, profiles!material_stock_movements_created_by_fkey(first_name,last_name), work_orders!material_stock_movements_work_order_id_fkey(code,title)').eq('material_id', materialId).is('deleted_at', null).order('created_at', { ascending: false }).limit(80), { service: 'materialsService', operation: 'list material stock movements', resource: materialId });
  },
  adjustStock(materialId: string, payload: { movement_type: string; quantity: number | string; reason: string; unit_cost?: number | string }) {
    return expectData<number>(supabase.rpc('dmp_adjust_material_stock', { p_material_id: materialId, p_movement_type: payload.movement_type, p_quantity: Number(payload.quantity), p_reason: payload.reason, p_unit_cost: payload.unit_cost === '' || payload.unit_cost == null ? null : Number(payload.unit_cost) }), { service: 'materialsService', operation: 'adjust material stock', resource: materialId });
  },
};
