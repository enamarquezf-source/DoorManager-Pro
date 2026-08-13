import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';
import { codesService } from './codesService';

const materialColumns = ['company_id', 'code', 'description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'minimum_stock', 'active'];

function cleanPayload(payload: Record<string, any>) {
  return Object.fromEntries(materialColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

function normalizeMaterial(payload: Record<string, any>) {
  const next = cleanPayload(payload);
  for (const key of ['cost', 'price', 'minimum_stock']) if (key in next) next[key] = Number(next[key] ?? 0);
  if ('active' in next) next.active = next.active === true || next.active === 'true' || next.active === 'Activo';
  return next;
}

export const materialsService = {
  async list(search = '', companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('materials').select('*').is('deleted_at', null).order('description');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'description', 'manufacturer', 'reference', 'unit'], search));
    return expectData<any[]>(query, { service: 'materialsService', operation: 'list materials' });
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const code = payload.code || await codesService.next('materials', 'MAT', false, 6, company_id);
    const row = { ...normalizeMaterial(payload), company_id, code };
    return expectData<any>(supabase.from('materials').insert(row).select().maybeSingle(), { service: 'materialsService', operation: 'create material' });
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('materials').update(normalizeMaterial(payload)).eq('id', id).select().maybeSingle(), { service: 'materialsService', operation: 'update material', resource: id });
  },
  deactivate(id: string) {
    return expectData<any>(supabase.from('materials').update({ active: false, deleted_at: new Date().toISOString() }).eq('id', id).select().maybeSingle(), { service: 'materialsService', operation: 'deactivate material', resource: id });
  },
};
