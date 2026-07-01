import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';

export const casesService = {
  list(search = '') {
    let query = supabase.from('cases').select('*, clients(code, legal_name), sites(code, name), case_links(*)').is('deleted_at', null).order('created_at', { ascending: false });
    if (search) query = query.or(contains(['code', 'title', 'description', 'status', 'type'], search));
    return expectData<any[]>(query);
  },
  get(id: string) {
    return expectData<any>(supabase.from('cases').select('*, clients(*), sites(*), case_events(*), case_links(*), case_documents(*)').eq('id', id).single());
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    const created_by = await currentProfileId();
    return expectData<any>(supabase.from('cases').insert({ ...payload, company_id, created_by }).select().single());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('cases').update(payload).eq('id', id).select().single());
  },
  async link(case_id: string, related_type: string, related_id: string) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('case_links').insert({ company_id, case_id, related_type, related_id }).select().single());
  },
};
