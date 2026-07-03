import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

const clientColumns = ['legal_name', 'trade_name', 'tax_id', 'status', 'address', 'city', 'province', 'postal_code', 'country', 'phone', 'email', 'notes'];
function clientPayload(payload: Record<string, any>) {
  return Object.fromEntries(clientColumns.filter((key) => key in payload).map((key) => [key, payload[key] || null]));
}

export const clientsService = {
  list(search = '') {
    let query = supabase.from('clients').select('*, client_contacts(*), sites(id, code, name), equipment(id, code), cases(id, code), work_orders(id, code)').is('deleted_at', null).order('legal_name');
    if (search) query = query.or(contains(['code', 'legal_name', 'trade_name', 'tax_id', 'email', 'phone'], search));
    return expectData<any[]>(query);
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('clients').select('*, client_contacts(*), sites(*), equipment(*), cases(*), work_orders(*)').eq('id', id).maybeSingle());
    if (!row) throw new Error('No se ha encontrado el cliente solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('clients').insert({ ...clientPayload(payload), company_id }).select().maybeSingle());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('clients').update(clientPayload(payload)).eq('id', id).select().maybeSingle());
  },
  async addContact(client_id: string, payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('client_contacts').insert({ ...payload, client_id, company_id }).select().single());
  },
  updateContact(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('client_contacts').update(payload).eq('id', id).select().single());
  },
};
