import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const equipmentService = {
  list(search = '') {
    let query = supabase.from('equipment').select('*, clients(code, legal_name), sites(code, name), equipment_types(name), equipment_components(*)').is('deleted_at', null).order('code');
    if (search) query = query.or(contains(['code', 'brand', 'model', 'serial_number', 'internal_location', 'status'], search));
    return expectData<any[]>(query);
  },
  types() {
    return expectData<any[]>(supabase.from('equipment_types').select('*').eq('active', true).order('name'));
  },
  get(id: string) {
    return expectData<any>(supabase.from('equipment').select(`
      *,
      clients(*),
      sites(*),
      equipment_types(*),
      equipment_components(*),
      checks!checks_equipment_id_fkey(*),
      work_orders!work_orders_main_equipment_id_fkey(*),
      deficiencies!deficiencies_equipment_id_fkey(*)
    `).eq('id', id).single());
  },
  history(id: string) {
    return expectData<any[]>(supabase.from('v_equipment_history').select('*').eq('equipment_id', id).order('event_at', { ascending: false }));
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('equipment').insert({ ...payload, company_id }).select().single());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('equipment').update(payload).eq('id', id).select().single());
  },
  async addComponent(equipment_id: string, payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('equipment_components').insert({ ...payload, equipment_id, company_id }).select().single());
  },
};
