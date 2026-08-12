import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';
import { codesService } from './codesService';
import { applyArchiveFilter, type ArchiveFilter } from './entityLifecycleService';

const equipmentColumns = ['client_id', 'site_id', 'equipment_type_id', 'brand', 'model', 'serial_number', 'installation_date', 'internal_location', 'status', 'criticality', 'last_review_date', 'next_review_date', 'technical_config', 'notes'];
function equipmentPayload(payload: Record<string, any>) {
  return Object.fromEntries(equipmentColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}
const componentColumns = ['component_type', 'brand', 'model', 'serial_number', 'installed_at', 'status', 'technical_config', 'notes'];
function componentPayload(payload: Record<string, any>) {
  return Object.fromEntries(componentColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

export const equipmentService = {
  async list(search = '', companyScope?: string | null, archiveFilter: ArchiveFilter = 'active') {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = applyArchiveFilter(supabase.from('equipment').select('*, companies!equipment_company_id_fkey(name), clients!equipment_client_id_fkey(code, legal_name), sites!equipment_site_id_fkey(code, name), equipment_types!equipment_equipment_type_id_fkey(name), equipment_components!equipment_components_equipment_id_fkey(*)'), archiveFilter).order('code');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'brand', 'model', 'serial_number', 'internal_location', 'status'], search));
    return expectData<any[]>(query);
  },
  async types(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('equipment_types').select('*').eq('active', true).order('name');
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('equipment').select(`
      *,
      clients!equipment_client_id_fkey(*),
      sites!equipment_site_id_fkey(*),
      equipment_types!equipment_equipment_type_id_fkey(*),
      equipment_components!equipment_components_equipment_id_fkey(*),
      checks!checks_equipment_id_fkey(*),
      work_orders!work_orders_main_equipment_id_fkey(*),
      deficiencies!deficiencies_equipment_id_fkey(*)
    `).eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el equipo solicitado.');
    return row;
  },
  history(id: string) {
    return expectData<any[]>(supabase.from('v_equipment_history').select('*').eq('equipment_id', id).order('event_at', { ascending: false }));
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const code = await codesService.equipment(payload.equipment_type_id, company_id);
    return expectData<any>(supabase.from('equipment').insert({ ...equipmentPayload(payload), company_id, code }).select().maybeSingle());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('equipment').update(equipmentPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async addComponent(equipment_id: string, payload: Record<string, any>) {
    const parent = await expectData<any>(supabase.from('equipment').select('company_id').eq('id', equipment_id).single(), { service: 'equipmentService', operation: 'load equipment for component', resource: equipment_id });
    const company_id = parent.company_id;
    const safePayload = { ...componentPayload(payload), equipment_id, company_id };
    const { data, error } = await supabase.from('equipment_components').insert(safePayload).select().maybeSingle();
    if (error) {
      console.error('DMP equipment component save failed', { payload: safePayload, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
      return expectData<any>(Promise.resolve({ data, error }), { service: 'equipmentService', operation: 'create equipment component', resource: equipment_id });
    }
    return data;
  },
  async updateComponent(id: string, payload: Record<string, any>) {
    const safePayload = componentPayload(payload);
    const { data, error } = await supabase.from('equipment_components').update(safePayload).eq('id', id).select().maybeSingle();
    if (error) {
      console.error('DMP equipment component save failed', { payload: safePayload, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
      return expectData<any>(Promise.resolve({ data, error }), { service: 'equipmentService', operation: 'update equipment component', resource: id });
    }
    return data;
  },
  async deleteComponent(id: string) {
    return expectData<any>(supabase.from('equipment_components').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().maybeSingle(), { service: 'equipmentService', operation: 'delete equipment component', resource: id });
  },
};
