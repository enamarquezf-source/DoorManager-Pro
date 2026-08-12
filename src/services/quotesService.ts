import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';

const quoteColumns = ['client_id', 'site_id', 'equipment_id', 'work_order_id', 'opportunity_id', 'case_id', 'quote_type', 'status', 'title', 'description', 'valid_until', 'discount_amount'];
const lineColumns = ['quote_id', 'line_type', 'description', 'quantity', 'unit', 'unit_cost', 'unit_price', 'tax_rate', 'material_id', 'profile_id', 'position'];

function cleanPayload(payload: Record<string, any>, columns: string[]) {
  return Object.fromEntries(columns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

function normalizeQuote(payload: Record<string, any>) {
  return { status: 'Borrador', quote_type: 'reparacion', ...cleanPayload(payload, quoteColumns) };
}

function normalizeLine(payload: Record<string, any>) {
  const line = cleanPayload(payload, lineColumns);
  const quantity = Number(line.quantity ?? 1);
  const unitCost = Number(line.unit_cost ?? 0);
  const unitPrice = Number(line.unit_price ?? 0);
  return { ...line, quantity, unit_cost: unitCost, unit_price: unitPrice, total_cost: quantity * unitCost, total_price: quantity * unitPrice, total: quantity * unitPrice };
}

export const quotesService = {
  async list(search = '') {
    const companyId = await currentCompanyId();
    let query = supabase.from('quotes').select('*, clients!quotes_client_id_fkey(code,legal_name), sites!quotes_site_id_fkey(code,name), opportunities!quotes_opportunity_id_fkey(code,title), profiles!quotes_created_by_fkey(first_name,last_name)').eq('company_id', companyId).is('deleted_at', null).order('issue_date', { ascending: false });
    if (search) query = query.or(contains(['code', 'title', 'status', 'quote_type'], search));
    return expectData<any[]>(query, { service: 'quotesService', operation: 'list quotes' });
  },
  async get(id: string) {
    const row = await expectData<any>(supabase.from('quotes').select('*, clients!quotes_client_id_fkey(code,legal_name), sites!quotes_site_id_fkey(code,name), equipment!quotes_equipment_id_fkey(code), work_orders!quotes_work_order_id_fkey(code,title), opportunities!quotes_opportunity_id_fkey(code,title), quote_lines!quote_lines_quote_id_fkey(*)').eq('id', id).maybeSingle(), { service: 'quotesService', operation: 'get quote', resource: id });
    if (!row) throw new Error('No se ha encontrado el presupuesto solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const created_by = await currentProfileId();
    return expectData<any>(supabase.from('quotes').insert({ ...normalizeQuote(payload), company_id, created_by }).select().maybeSingle(), { service: 'quotesService', operation: 'create quote' });
  },
  async update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('quotes').update(normalizeQuote(payload)).eq('id', id).select().maybeSingle(), { service: 'quotesService', operation: 'update quote', resource: id });
  },
  async addLine(quoteId: string, payload: Record<string, any>) {
    const quote = await this.get(quoteId);
    const position = payload.position ?? ((quote.quote_lines ?? []).filter((line: any) => !line.deleted_at).length + 1);
    return expectData<any>(supabase.from('quote_lines').insert({ ...normalizeLine({ ...payload, position }), quote_id: quoteId, company_id: quote.company_id }).select().maybeSingle(), { service: 'quotesService', operation: 'add quote line', resource: quoteId });
  },
};
