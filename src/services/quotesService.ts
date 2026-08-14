import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, currentProfileId, expectData } from './query';
import { codesService } from './codesService';
import { applyArchiveFilter, type ArchiveFilter } from './entityLifecycleService';

export const quoteStatuses = ['Borrador', 'Enviado', 'Aceptado', 'Ejecutado en cliente', 'Rechazado', 'Caducado', 'Cancelado'] as const;
export const quoteStatusFilters = ['Todos', 'Borrador', 'Enviado', 'Aceptado', 'Ejecutado en cliente', 'Rechazado', 'Caducado', 'Cancelado'] as const;
export const quoteTypes = ['instalacion', 'reparacion', 'mantenimiento'] as const;
export const quoteLineTypes = ['material', 'labor', 'transport', 'travel', 'mobile_workshop', 'lifting_platform', 'auxiliary_equipment', 'external_cost', 'fee', 'discount', 'other'] as const;

const quoteColumns = ['client_id', 'site_id', 'equipment_id', 'work_order_id', 'opportunity_id', 'case_id', 'quote_type', 'status', 'title', 'description', 'valid_until', 'discount_type', 'discount_value', 'discount_amount', 'conditions', 'sent_at', 'sent_to_email'];
const lineColumns = ['quote_id', 'line_type', 'description', 'quantity', 'unit', 'unit_cost', 'unit_price', 'tax_rate', 'material_id', 'profile_id', 'position', 'discount_percent'];

function cleanPayload(payload: Record<string, any>, columns: string[]) {
  return Object.fromEntries(columns.filter((key) => key in payload).map((key) => [key, payload[key] === '' ? null : payload[key]]));
}

function normalizeQuote(payload: Record<string, any>, defaults = false) {
  const next: Record<string, any> = { ...(defaults ? { status: 'Borrador', quote_type: 'reparacion', discount_type: 'percentage', discount_value: 0 } : {}), ...cleanPayload(payload, quoteColumns) };
  if (next.status === 'Mandado') next.status = 'Enviado';
  if (next.discount_type !== undefined && next.discount_type !== 'percentage' && next.discount_type !== 'amount') next.discount_type = 'percentage';
  if (next.discount_value !== undefined) next.discount_value = numericField(next.discount_value, 0, 'el descuento');
  if (next.discount_amount !== undefined) next.discount_amount = numericField(next.discount_amount, 0, 'el descuento');
  return next;
}

export function calculateQuoteEconomics(lines: Array<{ total_cost: number; total_price: number; tax_rate: number }>, discountType = 'percentage', discountValue = 0) {
  const subtotalCost = Math.round(lines.reduce((sum, line) => sum + Number(line.total_cost ?? 0), 0) * 100) / 100;
  const subtotalSale = Math.round(lines.reduce((sum, line) => sum + Number(line.total_price ?? 0), 0) * 100) / 100;
  const rawDiscount = discountType === 'percentage' ? subtotalSale * Number(discountValue ?? 0) / 100 : Number(discountValue ?? 0);
  const discountAmount = Math.round(Math.min(Math.max(rawDiscount, 0), subtotalSale) * 100) / 100;
  const taxableBase = Math.round(Math.max(subtotalSale - discountAmount, 0) * 100) / 100;
  const taxAmount = Math.round(lines.reduce((sum, line) => {
    const lineSale = Number(line.total_price ?? 0);
    const lineDiscount = subtotalSale === 0 ? 0 : discountAmount * lineSale / subtotalSale;
    return sum + Math.max(lineSale - lineDiscount, 0) * Number(line.tax_rate ?? 0) / 100;
  }, 0) * 100) / 100;
  return { subtotalCost, subtotalSale, discountAmount, taxableBase, taxAmount, totalAmount: taxableBase + taxAmount, estimatedMargin: taxableBase - subtotalCost };
}

function firstPayloadValue(payload: Record<string, any>, keys: string[]) {
  const key = keys.find((item) => payload[item] !== undefined && payload[item] !== null && payload[item] !== '');
  return key ? payload[key] : undefined;
}

function numericField(value: any, fallback: number, field: string) {
  const next = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(next)) throw new Error(`validacion del formulario: ${field} no es un numero valido.`);
  return next;
}

export function normalizeQuoteLinePayload(payload: Record<string, any>) {
  const expanded = { ...payload };
  const unitPriceValue = firstPayloadValue(payload, ['unit_price', 'unitPrice', 'price', 'salePrice', 'sale_price', 'unitSale', 'sellingPrice']);
  if (unitPriceValue !== undefined) expanded.unit_price = unitPriceValue;
  const line = cleanPayload(expanded, lineColumns);
  const quantity = numericField(line.quantity, 1, 'la cantidad');
  const unitCost = numericField(line.unit_cost, 0, 'el coste unitario');
  const unitPrice = numericField(line.unit_price, unitCost, 'la venta unitaria');
  const taxRate = numericField(line.tax_rate, 21, 'el IVA');
  if (quantity <= 0) throw new Error('validacion del formulario: la cantidad debe ser mayor que cero.');
  if (unitCost < 0) throw new Error('validacion del formulario: el coste unitario no puede ser negativo.');
  if (unitPrice < 0) throw new Error('validacion del formulario: la venta unitaria no puede ser negativa.');
  if (taxRate < 0) throw new Error('validacion del formulario: el IVA no puede ser negativo.');
  const totalCost = Math.round(quantity * unitCost * 100) / 100;
  const totalPrice = Math.round(quantity * unitPrice * 100) / 100;
  return { ...line, quantity, unit_cost: unitCost, unit_price: unitPrice, tax_rate: taxRate, total_cost: totalCost, total_price: totalPrice, total: totalPrice };
}

async function optionalRelated(table: string, id: string, columns: string, quoteId: string) {
  try {
    return await expectData<any>((supabase as any).from(table).select(columns).eq('id', id).maybeSingle(), { service: 'quotesService', operation: `get quote ${table}`, resource: quoteId });
  } catch (error: any) {
    console.error('DMP get quote related failed', { quoteId, table, relatedId: id, columns, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
    return null;
  }
}

export const quotesService = {
  async list(search = '', status = 'Todos', companyScope?: string | null, archiveFilter: ArchiveFilter = 'active') {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = applyArchiveFilter(supabase.from('quotes').select('*, clients!quotes_client_id_fkey(code,legal_name), sites!quotes_site_id_fkey(code,name), opportunities!quotes_opportunity_id_fkey(code,title), profiles!quotes_created_by_fkey(first_name,last_name)'), archiveFilter).order('issue_date', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (status && status !== 'Todos') query = query.eq('status', status === 'Mandado' ? 'Enviado' : status);
    if (search) query = query.or(contains(['code', 'title', 'status', 'quote_type'], search));
    return expectData<any[]>(query, { service: 'quotesService', operation: 'list quotes' });
  },
  async get(id: string) {
    if (!id) throw new Error('No se ha indicado el presupuesto a abrir.');
    try {
      const row = await expectData<any>(supabase.from('quotes').select('*').eq('id', id).is('deleted_at', null).maybeSingle(), { service: 'quotesService', operation: 'get quote', resource: id });
      if (!row) throw new Error('No se ha encontrado el presupuesto solicitado.');
      const [clients, sites, equipment, workOrders, opportunities, lines] = await Promise.all([
        row.client_id ? optionalRelated('clients', row.client_id, 'id,code,legal_name,email,company_id,deleted_at', id) : Promise.resolve(null),
        row.site_id ? optionalRelated('sites', row.site_id, 'code,name,address', id) : Promise.resolve(null),
        row.equipment_id ? optionalRelated('equipment', row.equipment_id, 'code,brand,model', id) : Promise.resolve(null),
        row.work_order_id ? optionalRelated('work_orders', row.work_order_id, 'code,title', id) : Promise.resolve(null),
        row.opportunity_id ? optionalRelated('opportunities', row.opportunity_id, 'code,title', id) : Promise.resolve(null),
        expectData<any[]>(supabase.from('quote_lines').select('*').eq('quote_id', id).order('position'), { service: 'quotesService', operation: 'get quote lines', resource: id }),
      ]);
      return { ...row, clients, sites, equipment, work_orders: workOrders, opportunities, quote_lines: (lines ?? []).filter((line: any) => !line.deleted_at).sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0)) };
    } catch (error: any) {
      console.error('DMP get quote failed', { quoteId: id, query: 'quotes + quote_lines + optional related records', message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
      throw error;
    }
  },
  async create(payload: Record<string, any>) {
    const company_id = payload.company_id || await currentCompanyId();
    const created_by = await currentProfileId();
    const code = payload.code || await codesService.next('quotes', 'PRE', true, 6, company_id);
    const insertPayload = { ...normalizeQuote(payload, true), company_id, created_by, code };
    try {
      return await expectData<any>(supabase.from('quotes').insert(insertPayload).select().maybeSingle(), { service: 'quotesService', operation: 'create quote' });
    } catch (error: any) {
      console.error('DMP quote operation failed', { action: 'create quote', payload: insertPayload, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
      throw error;
    }
  },
  async update(id: string, payload: Record<string, any>) {
    const updated_by = await currentProfileId();
    return expectData<any>(supabase.from('quotes').update({ ...normalizeQuote(payload), updated_by }).eq('id', id).select().maybeSingle(), { service: 'quotesService', operation: 'update quote', resource: id });
  },
  async changeStatus(id: string, status: string, reason = 'Cambio rapido de estado') {
    const updated_by = await currentProfileId();
    return expectData<any>(supabase.from('quotes').update({ status: status === 'Mandado' ? 'Enviado' : status, updated_by }).eq('id', id).select().maybeSingle(), { service: 'quotesService', operation: 'change quote status', resource: id });
  },
  async addLine(quoteId: string, payload: Record<string, any>) {
    const quote = await this.get(quoteId);
    const position = payload.position ?? ((quote.quote_lines ?? []).filter((line: any) => !line.deleted_at).length + 1);
    const normalizedPayload = { ...normalizeQuoteLinePayload({ ...payload, position }), quote_id: quoteId, company_id: quote.company_id };
    try {
      return await expectData<any>(supabase.from('quote_lines').insert(normalizedPayload).select().maybeSingle(), { service: 'quotesService', operation: 'add quote line', resource: quoteId });
    } catch (error: any) {
      console.error('DMP quote line debug', { payloadBeforeNormalize: payload, normalizedPayload, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code });
      throw error;
    }
  },
  async updateLine(lineId: string, payload: Record<string, any>) {
    const normalizedPayload = normalizeQuoteLinePayload(payload);
    try {
      return await expectData<any>(supabase.from('quote_lines').update(normalizedPayload).eq('id', lineId).select().maybeSingle(), { service: 'quotesService', operation: 'update quote line', resource: lineId });
    } catch (error: any) {
      console.error('DMP quote line debug', { payloadBeforeNormalize: payload, normalizedPayload, message: error?.message, details: error?.details, hint: error?.hint, code: error?.code });
      throw error;
    }
  },
  deleteLine(lineId: string) {
    return expectData<any>(supabase.from('quote_lines').update({ deleted_at: new Date().toISOString() }).eq('id', lineId).select().maybeSingle(), { service: 'quotesService', operation: 'delete quote line', resource: lineId });
  },
  sendToClient(id: string, email: string) {
    return this.update(id, { status: 'Enviado', sent_at: new Date().toISOString(), sent_to_email: email });
  },
  async materialOptions(search = '') {
    let query = supabase.from('materials').select('id, code, description, manufacturer, reference, unit, cost, price, stock_quantity, minimum_stock, stock_controlled, allow_negative_stock').is('deleted_at', null).eq('active', true).order('description').limit(30);
    if (search) query = query.or(contains(['code', 'description', 'manufacturer', 'reference'], search));
    return expectData<any[]>(query, { service: 'quotesService', operation: 'list quote materials' });
  },
  economics(quotes: any[]) {
    const active = quotes.filter((quote) => !quote.deleted_at);
    const byStatus = Object.fromEntries(quoteStatuses.map((status) => [status, active.filter((quote) => quote.status === status).length]));
    const cost = active.reduce((sum, quote) => sum + Number(quote.subtotal_cost ?? 0), 0);
    const sale = active.reduce((sum, quote) => sum + Number(quote.subtotal_sale ?? quote.subtotal ?? 0), 0);
    const total = active.reduce((sum, quote) => sum + Number(quote.total_amount ?? quote.total ?? 0), 0);
    return { count: active.length, total, accepted: active.filter((quote) => quote.status === 'Aceptado').reduce((sum, quote) => sum + Number(quote.total_amount ?? quote.total ?? 0), 0), executed: active.filter((quote) => quote.status === 'Ejecutado en cliente').reduce((sum, quote) => sum + Number(quote.total_amount ?? quote.total ?? 0), 0), cost, sale, margin: sale - cost, byStatus };
  },
};
