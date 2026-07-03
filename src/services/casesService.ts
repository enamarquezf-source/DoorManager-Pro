import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';

const caseColumns = ['title', 'description', 'type', 'priority', 'status', 'client_id', 'site_id', 'origin', 'responsible_profile_id'];
function casePayload(payload: Record<string, any>) {
  return Object.fromEntries(caseColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

export const casesService = {
  list(search = '') {
    let query = supabase.from('cases').select('*, clients(code, legal_name), sites(code, name), case_links(*)').is('deleted_at', null).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['code', 'title', 'description', 'status', 'type'], search));
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('cases').select('*, clients(*), sites(*), case_events(*), case_links(*), case_documents(*)').eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el expediente solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    const created_by = await currentProfileId();
    return expectData<any>(supabase.rpc('create_case', {
      p_company_id: company_id,
      p_client_id: payload.client_id,
      p_site_id: payload.site_id || null,
      p_title: payload.title,
      p_description: payload.description || null,
      p_type: payload.type,
      p_priority: payload.priority,
      p_status: payload.status || 'Abierto',
      p_origin: payload.origin,
      p_created_by: created_by,
    }));
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('cases').update(casePayload(payload)).eq('id', id).select().maybeSingle());
  },
  async link(case_id: string, related_type: string, related_id: string) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('case_links').insert({ company_id, case_id, related_type, related_id }).select().single());
  },
};
