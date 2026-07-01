import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const documentsService = {
  list(search = '') {
    let query = supabase.from('documents').select('*, document_links(*)').is('deleted_at', null).order('title');
    if (search) query = query.or(contains(['title', 'type', 'origin', 'observations'], search));
    return expectData<any[]>(query);
  },
  get(id: string) {
    return expectData<any>(supabase.from('documents').select('*, files(*), document_links(*)').eq('id', id).single());
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('documents').insert({ ...payload, company_id }).select().single());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('documents').update(payload).eq('id', id).select().single());
  },
  async link(document_id: string, related_type: string, related_id?: string | null, related_value?: string | null) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('document_links').insert({ company_id, document_id, related_type, related_id: related_id || null, related_value: related_value || null }).select().single());
  },
};
