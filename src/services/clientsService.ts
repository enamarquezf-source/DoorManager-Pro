import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';
import { codesService } from './codesService';

const clientColumns = ['legal_name', 'trade_name', 'tax_id', 'status', 'address', 'city', 'province', 'postal_code', 'country', 'phone', 'email', 'notes'];
function clientPayload(payload: Record<string, any>) {
  return Object.fromEntries(clientColumns.filter((key) => key in payload).map((key) => [key, payload[key] || null]));
}

export const clientsService = {
  async list(search = '', companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('clients').select('*, companies!clients_company_id_fkey(name), client_contacts!client_contacts_client_id_fkey(*), sites!sites_client_id_fkey(id, code, name), equipment!equipment_client_id_fkey(id, code), cases!cases_client_id_fkey(id, code), work_orders!work_orders_client_id_fkey(id, code)').is('deleted_at', null).order('legal_name');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'legal_name', 'trade_name', 'tax_id', 'email', 'phone'], search));
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('clients').select('*, client_contacts!client_contacts_client_id_fkey(*), sites!sites_client_id_fkey(*), equipment!equipment_client_id_fkey(*), cases!cases_client_id_fkey(*), work_orders!work_orders_client_id_fkey(*)').eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el cliente solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const code = await codesService.next('clients', 'CLI', false, 6, company_id);
    return expectData<any>(supabase.from('clients').insert({ ...clientPayload(payload), company_id, code }).select().maybeSingle());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('clients').update(clientPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async addContact(client_id: string, payload: Record<string, any>) {
    const parent = await expectData<any>(supabase.from('clients').select('company_id').eq('id', client_id).single());
    const company_id = payload.company_id || parent.company_id;
    return expectData<any>(supabase.from('client_contacts').insert({ ...payload, client_id, company_id }).select().single());
  },
  updateContact(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('client_contacts').update(payload).eq('id', id).select().single());
  },
};
