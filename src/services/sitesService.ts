import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

const siteColumns = ['client_id', 'name', 'address', 'city', 'province', 'postal_code', 'country', 'schedule', 'access_requirement_id', 'primary_contact_id', 'active', 'notes'];
function sitePayload(payload: Record<string, any>) {
  return Object.fromEntries(siteColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

export const sitesService = {
  list(search = '') {
    let query = supabase.from('sites').select('*, clients(code, legal_name), site_contacts(*), equipment(id, code), cases(id, code), work_orders(id, code), access_requirements(*)').is('deleted_at', null).order('name');
    if (search) query = query.or(contains(['code', 'name', 'address', 'city'], search));
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('sites').select('*, clients(*), site_contacts(*), equipment(*), cases(*), work_orders(*), access_requirements(*)').eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el centro solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('sites').insert({ ...sitePayload(payload), company_id }).select().maybeSingle());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('sites').update(sitePayload(payload)).eq('id', id).select().maybeSingle());
  },
  async addContact(site_id: string, payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('site_contacts').insert({ ...payload, site_id, company_id }).select().single());
  },
};
