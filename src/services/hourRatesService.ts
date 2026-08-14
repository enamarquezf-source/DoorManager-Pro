import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

const rateColumns = ['company_id', 'technician_profile_id', 'category', 'hourly_cost', 'hourly_price', 'valid_from', 'valid_to', 'active', 'notes'];

function normalizeRate(payload: Record<string, any>) {
  const next = Object.fromEntries(rateColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
  if ('hourly_cost' in next) next.hourly_cost = Number(next.hourly_cost ?? 0);
  if ('hourly_price' in next) next.hourly_price = Number(next.hourly_price ?? 0);
  if ('active' in next) next.active = next.active === true || next.active === 'true' || next.active === 'Activo';
  return next;
}

export const hourRatesService = {
  async list(search = '', companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('technician_hour_rates').select('*, profiles!technician_hour_rates_technician_profile_id_fkey(first_name,last_name,primary_area)').is('deleted_at', null).order('valid_from', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['category', 'notes'], search));
    return expectData<any[]>(query, { service: 'hourRatesService', operation: 'list hour rates' });
  },
  async technicianOptions(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('profiles').select('id, first_name, last_name, primary_area').eq('active', true).is('deleted_at', null).order('first_name');
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query, { service: 'hourRatesService', operation: 'list technician options' });
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    return expectData<any>(supabase.from('technician_hour_rates').insert({ ...normalizeRate(payload), company_id }).select().maybeSingle(), { service: 'hourRatesService', operation: 'create hour rate' });
  },
  update(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('technician_hour_rates').update(normalizeRate(payload)).eq('id', id).select().maybeSingle(), { service: 'hourRatesService', operation: 'update hour rate', resource: id });
  },
  archive(id: string) {
    return expectData<any>(supabase.from('technician_hour_rates').update({ active: false, deleted_at: new Date().toISOString() }).eq('id', id).select().maybeSingle(), { service: 'hourRatesService', operation: 'archive hour rate', resource: id });
  },
};
