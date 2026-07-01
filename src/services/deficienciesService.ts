import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const deficienciesService = {
  list(search = '') {
    let query = supabase.from('deficiencies').select(`
      *,
      clients!deficiencies_client_id_fkey(code, legal_name),
      sites!deficiencies_site_id_fkey(code, name),
      equipment!deficiencies_equipment_id_fkey(code),
      work_orders!deficiencies_work_order_id_fkey(code),
      checks!deficiencies_check_id_fkey(code),
      profiles!deficiencies_responsible_profile_id_fkey(first_name,last_name)
    `).is('deleted_at', null).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['code', 'description', 'recommended_action', 'status', 'severity'], search));
    return expectData<any[]>(query);
  },
  get(id: string) {
    return expectData<any>(supabase.from('deficiencies').select(`
      *,
      corrective_actions(*),
      clients!deficiencies_client_id_fkey(*),
      sites!deficiencies_site_id_fkey(*),
      equipment!deficiencies_equipment_id_fkey(*),
      work_orders!deficiencies_work_order_id_fkey(*),
      checks!deficiencies_check_id_fkey(*),
      profiles!deficiencies_responsible_profile_id_fkey(first_name,last_name)
    `).eq('id', id).single());
  },
  async createFromCheck(checkId: string, itemId: string, severity: string, description: string, recommendedAction: string, responsible?: string | null) {
    return expectData<string>(supabase.rpc('create_deficiency_from_check', { p_check_id: checkId, p_item_id: itemId, p_severity: severity, p_description: description, p_recommended_action: recommendedAction, p_responsible: responsible || null }));
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('deficiencies').update(payload).eq('id', id).select().single());
  },
  async addAction(deficiency_id: string, payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('corrective_actions').insert({ ...payload, deficiency_id, company_id }).select().single());
  },
};
