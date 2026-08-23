import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';

const rateColumns = ['company_id', 'technician_profile_id', 'category', 'hourly_cost', 'hourly_price', 'valid_from', 'valid_to', 'active', 'notes'];
const catalogColumns = ['company_id', 'code', 'name', 'kind', 'classification', 'unit', 'billing_mode', 'period_days', 'contributes_to_sale', 'active', 'notes'];
const versionColumns = ['company_id', 'rate_id', 'technician_profile_id', 'category', 'cost_amount', 'sale_amount', 'valid_from', 'valid_to', 'active', 'notes'];

function normalizeRate(payload: Record<string, any>) {
  const next = Object.fromEntries(rateColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
  if ('hourly_cost' in next) next.hourly_cost = Number(next.hourly_cost ?? 0);
  if ('hourly_price' in next) next.hourly_price = Number(next.hourly_price ?? 0);
  if ('active' in next) next.active = next.active === true || next.active === 'true' || next.active === 'Activo';
  return next;
}

export function hasUsableRateVersion(row: any, today = new Date().toISOString().slice(0, 10)) {
  return (row.rate_versions ?? []).some((version: any) => version.active !== false && !version.deleted_at && version.valid_from <= today && (!version.valid_to || version.valid_to >= today));
}

export const hourRatesService = {
  async catalog(search = '', companyScope?: string | null, kind?: string, includeArchived = false, includeId?: string) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    if (!includeArchived && kind === 'cost') {
      const result = await expectData<any[]>(supabase.rpc('dmp_rate_catalog_for_selection', { p_kind: kind }), { service: 'hourRatesService', operation: 'list selectable rate catalog' });
      return result.filter((row) => (!search || [row.code, row.name].some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()))) && (row.rate_version_id || row.id === includeId));
    }
    let query = supabase.from('rate_catalog').select('*, rate_versions!rate_versions_catalog_company_fk(*)').order('name');
    if (!includeArchived) query = query.is('deleted_at', null).eq('active', true);
    if (kind) query = query.eq('kind', kind).eq('classification', kind === 'labor' ? 'labor' : 'cost');
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'name', 'notes'], search));
    const rows = await expectData<any[]>(query, { service: 'hourRatesService', operation: 'list rate catalog' });
    if (includeArchived) return rows;
    return rows.filter((row) => hasUsableRateVersion(row) || row.id === includeId);
  },
  async createCatalog(payload: Record<string, any>) {
    const body = Object.fromEntries(catalogColumns.filter((key) => key !== 'company_id' && key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
    body.classification = body.classification ?? body.kind ?? 'cost';
    return expectData<any>(supabase.rpc('dmp_create_rate_catalog', { p_payload: body }), { service: 'hourRatesService', operation: 'create rate catalog entry' });
  },
  async updateCatalog(id: string, payload: Record<string, any>) {
    const body = Object.fromEntries(catalogColumns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
    return expectData<any>(supabase.rpc('dmp_update_rate_catalog', { p_catalog_id: id, p_payload: body }), { service: 'hourRatesService', operation: 'update rate catalog entry', resource: id });
  },
  async createVersion(payload: Record<string, any>) {
    const body = Object.fromEntries(versionColumns.filter((key) => key !== 'company_id' && key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
    return expectData<any>(supabase.rpc('dmp_create_rate_version', { p_payload: body }).then(async (result) => {
      if (result.error) return result;
      return supabase.from('rate_versions').select('*').eq('id', result.data).maybeSingle();
    }), { service: 'hourRatesService', operation: 'create rate version' });
  },
  async archiveCatalog(id: string) {
    return expectData<any>(supabase.rpc('dmp_archive_rate_catalog', { p_catalog_id: id }), { service: 'hourRatesService', operation: 'archive rate catalog entry', resource: id });
  },
  async archiveVersion(id: string) {
    return expectData<any>(supabase.rpc('dmp_archive_rate_version', { p_version_id: id }), { service: 'hourRatesService', operation: 'archive rate version', resource: id });
  },
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
