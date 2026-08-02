import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';
import { codesService } from './codesService';

const siteColumns = ['client_id', 'name', 'address', 'city', 'province', 'postal_code', 'country', 'schedule', 'access_requirement_id', 'primary_contact_id', 'active', 'notes'];
function sitePayload(payload: Record<string, any>) {
  return Object.fromEntries(siteColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

export const sitesService = {
  async list(search = '', companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('sites').select('*, companies!sites_company_id_fkey(name), clients!sites_client_id_fkey(code, legal_name), site_contacts!site_contacts_site_id_fkey(*), equipment!equipment_site_id_fkey(id, code), cases!cases_site_id_fkey(id, code), work_orders!work_orders_site_id_fkey(id, code), access_requirements!sites_access_requirement_id_fkey(*)').is('deleted_at', null).order('name');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'name', 'address', 'city'], search));
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('sites').select('*, clients!sites_client_id_fkey(*), site_contacts!site_contacts_site_id_fkey(*), equipment!equipment_site_id_fkey(*), cases!cases_site_id_fkey(*), work_orders!work_orders_site_id_fkey(*), access_requirements!sites_access_requirement_id_fkey(*)').eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el centro solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const code = await codesService.next('sites', 'CEN', false, 6, company_id);
    return expectData<any>(supabase.from('sites').insert({ ...sitePayload(payload), company_id, code }).select().maybeSingle());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('sites').update(sitePayload(payload)).eq('id', id).select().maybeSingle());
  },
  async addContact(site_id: string, payload: Record<string, any>) {
    const parent = await expectData<any>(supabase.from('sites').select('company_id').eq('id', site_id).single());
    const company_id = payload.company_id || parent.company_id;
    return expectData<any>(supabase.from('site_contacts').insert({ ...payload, site_id, company_id }).select().single());
  },
};
