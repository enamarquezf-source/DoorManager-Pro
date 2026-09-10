import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

const supplierColumns = ['name', 'trade_name', 'internal_code', 'tax_id', 'email', 'phone', 'contact_name', 'website', 'fiscal_address', 'postal_code', 'city', 'province', 'country', 'payment_method', 'payment_terms_days', 'payment_due_day', 'currency_code', 'usual_discount', 'supplier_customer_reference', 'billing_email', 'billing_notes', 'internal_notes', 'active'];

function cleanSupplier(payload: Record<string, any>) {
  return Object.fromEntries(supplierColumns.filter((key) => key in payload).map((key) => {
    const value = payload[key] === '' ? null : payload[key];
    return [key, ['payment_terms_days', 'payment_due_day', 'usual_discount'].includes(key) && value !== null ? Number(value) : value];
  }));
}

function cleanPurchaseUnitPrice(value: unknown) {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

export const suppliersService = {
  async list(search = '', active: 'active' | 'inactive' | 'all' = 'active') {
    const companyId = await currentCompanyId();
    let query = supabase.from('suppliers').select('id,company_id,name,trade_name,internal_code,tax_id,email,phone,contact_name,website,fiscal_address,postal_code,city,province,country,payment_method,payment_terms_days,payment_due_day,currency_code,usual_discount,supplier_customer_reference,billing_email,billing_notes,internal_notes,active,created_at,updated_at,deleted_at,material_suppliers(id,material_id,active)').order('name');
    if (companyId) query = query.eq('company_id', companyId);
    if (active === 'active') query = query.eq('active', true).is('deleted_at', null);
    if (active === 'inactive') query = query.eq('active', false).is('deleted_at', null);
    if (search) query = query.or(contains(['name', 'tax_id', 'email', 'phone'], search));
    return expectData<any[]>(query, { service: 'suppliersService', operation: 'list suppliers' });
  },
  async get(id: string, includeBanking = false) {
    const bankRelation = includeBanking ? ',supplier_bank_accounts(*)' : '';
    const row = await expectData<any>(supabase.from('suppliers').select(`*,material_suppliers(*)${bankRelation}`).eq('id', id).maybeSingle(), { service: 'suppliersService', operation: 'get supplier', resource: id });
    if (!row) throw new Error('No se ha encontrado el proveedor solicitado.');
    return row;
  },
  async create(payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    return expectData<any>(supabase.from('suppliers').insert({ ...cleanSupplier(payload), company_id }).select().single(), { service: 'suppliersService', operation: 'create supplier' });
  },
  update(id: string, payload: Record<string, any>) {
    const update = cleanSupplier(payload);
    return expectData<any>(supabase.from('suppliers').update(update).eq('id', id).select().single(), { service: 'suppliersService', operation: 'update supplier', resource: id });
  },
  setActive(id: string, active: boolean) {
    return expectData<any>(supabase.from('suppliers').update({ active, updated_at: new Date().toISOString() }).eq('id', id).select().single(), { service: 'suppliersService', operation: 'set supplier active', resource: id });
  },
  async savePrimaryBankAccount(supplierId: string, payload: Record<string, any>, companyScope?: string) {
    const company_id = companyScope ?? await currentCompanyId();
    const clean = Object.fromEntries(['account_holder', 'iban', 'bic_swift', 'notes'].map((key) => [key, payload[key] === '' ? null : payload[key]]));
    const existing = await expectData<any>(supabase.from('supplier_bank_accounts').select('id').eq('company_id', company_id).eq('supplier_id', supplierId).eq('is_primary', true).maybeSingle(), { service: 'suppliersService', operation: 'find primary supplier bank account', resource: supplierId });
    if (existing) return expectData<any>(supabase.from('supplier_bank_accounts').update({ ...clean, active: true, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single(), { service: 'suppliersService', operation: 'update supplier bank account', resource: supplierId });
    return expectData<any>(supabase.from('supplier_bank_accounts').insert({ company_id, supplier_id: supplierId, ...clean, is_primary: true, active: true }).select().single(), { service: 'suppliersService', operation: 'create supplier bank account', resource: supplierId });
  },
  async setPrimaryBankAccount(accountId: string, companyScope?: string) {
    const company_id = companyScope ?? await currentCompanyId();
    return expectData<any>(supabase.from('supplier_bank_accounts').update({ is_primary: true, active: true }).eq('id', accountId).eq('company_id', company_id).select().single(), { service: 'suppliersService', operation: 'set primary supplier bank account', resource: accountId });
  },
  async setBankAccountActive(accountId: string, active: boolean, companyScope?: string) {
    const company_id = companyScope ?? await currentCompanyId();
    return expectData<any>(supabase.from('supplier_bank_accounts').update({ active, ...(active ? {} : { is_primary: false }) }).eq('id', accountId).eq('company_id', company_id).select().single(), { service: 'suppliersService', operation: 'set supplier bank account active', resource: accountId });
  },
  async listMaterialSuppliers(materialId: string) {
    return expectData<any[]>(supabase.from('material_suppliers').select('id,company_id,material_id,supplier_id,supplier_reference,purchase_unit_price,is_preferred,active,created_at,updated_at,suppliers(id,name,tax_id,active)').eq('material_id', materialId).order('is_preferred', { ascending: false }).order('created_at'), { service: 'suppliersService', operation: 'list material suppliers', resource: materialId });
  },
  async addMaterialSupplier(materialId: string, payload: Record<string, any>) {
    const company_id = await currentCompanyId();
    const existing = await expectData<any>(supabase.from('material_suppliers').select('id').eq('company_id', company_id).eq('material_id', materialId).eq('supplier_id', payload.supplier_id).maybeSingle(), { service: 'suppliersService', operation: 'find material supplier', resource: materialId });
    const relation = { supplier_reference: payload.supplier_reference || null, purchase_unit_price: cleanPurchaseUnitPrice(payload.purchase_unit_price), is_preferred: Boolean(payload.is_preferred), active: true, updated_at: new Date().toISOString() };
    if (existing) return expectData<any>(supabase.from('material_suppliers').update(relation).eq('id', existing.id).select().single(), { service: 'suppliersService', operation: 'reactivate material supplier', resource: materialId });
    return expectData<any>(supabase.from('material_suppliers').insert({ company_id, material_id: materialId, supplier_id: payload.supplier_id, ...relation }).select().single(), { service: 'suppliersService', operation: 'add material supplier', resource: materialId });
  },
  updateMaterialSupplier(id: string, payload: Record<string, any>) {
    return expectData<any>(supabase.from('material_suppliers').update({ supplier_reference: payload.supplier_reference || null, purchase_unit_price: cleanPurchaseUnitPrice(payload.purchase_unit_price), is_preferred: Boolean(payload.is_preferred), active: payload.active !== false, updated_at: new Date().toISOString() }).eq('id', id).select().single(), { service: 'suppliersService', operation: 'update material supplier', resource: id });
  },
  deactivateMaterialSupplier(id: string) {
    return expectData<any>(supabase.from('material_suppliers').update({ active: false, is_preferred: false, updated_at: new Date().toISOString() }).eq('id', id).select().single(), { service: 'suppliersService', operation: 'deactivate material supplier', resource: id });
  },
  async setPreferredMaterialSupplier(id: string, materialId: string) {
    const company_id = await currentCompanyId();
    await expectData<any>(supabase.from('material_suppliers').update({ is_preferred: false, updated_at: new Date().toISOString() }).eq('company_id', company_id).eq('material_id', materialId), { service: 'suppliersService', operation: 'clear preferred material supplier', resource: materialId });
    return this.updateMaterialSupplier(id, { is_preferred: true, active: true });
  },
};
