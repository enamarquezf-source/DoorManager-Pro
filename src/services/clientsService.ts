import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

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
    return expectData<any>(supabase.from('clients').insert({ ...payload, company_id }).select().single());
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('clients').update(payload).eq('id', id).select().single());
  },
  async addContact(client_id: string, payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('client_contacts').insert({ ...payload, client_id, company_id }).select().single());
  },
  updateContact(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('client_contacts').update(payload).eq('id', id).select().single());
  },
};
