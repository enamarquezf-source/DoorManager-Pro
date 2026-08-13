import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const economicStatuses = ['pendiente', 'garantia', 'facturable', 'pendiente_facturar', 'facturado', 'cobrado'] as const;

export function workOrderEconomicSummary(workOrder: any) {
  const materials = workOrder.materials ?? workOrder.work_order_materials ?? [];
  const time = workOrder.time_entries ?? workOrder.work_order_time_entries ?? [];
  const costs = workOrder.cost_entries ?? workOrder.work_order_cost_entries ?? [];
  const materialCost = materials.reduce((sum: number, row: any) => sum + Number(row.used_quantity ?? 0) * Number(row.unit_cost ?? row.materials?.cost ?? row.unit_price ?? 0), 0);
  const materialSale = materials.reduce((sum: number, row: any) => sum + Number(row.used_quantity ?? 0) * Number(row.unit_price ?? row.materials?.price ?? 0), 0);
  const timeCost = time.reduce((sum: number, row: any) => sum + Number(row.duration_minutes ?? 0) / 60 * Number(row.hourly_cost ?? 0), 0);
  const timeSale = time.reduce((sum: number, row: any) => sum + Number(row.duration_minutes ?? 0) / 60 * Number(row.hourly_price ?? 0), 0);
  const auxiliaryCost = costs.reduce((sum: number, row: any) => sum + Number(row.quantity ?? 0) * Number(row.unit_cost ?? 0), 0);
  const auxiliarySale = costs.reduce((sum: number, row: any) => sum + Number(row.quantity ?? 0) * Number(row.unit_price ?? 0), 0);
  const realCost = Math.round((materialCost + timeCost + auxiliaryCost) * 100) / 100;
  const directSale = Math.round((materialSale + timeSale + auxiliarySale) * 100) / 100;
  const estimatedSale = Number(workOrder.estimated_sale_amount ?? 0) || directSale || Number(workOrder.quotes?.subtotal_sale ?? workOrder.quotes?.taxable_base ?? 0);
  const billable = workOrder.billable !== false && workOrder.warranty !== true && workOrder.economic_status !== 'garantia' && workOrder.economic_status !== 'no_facturable';
  const sale = billable ? Math.round(estimatedSale * 100) / 100 : 0;
  const margin = sale > 0 ? Math.round((sale - realCost) * 100) / 100 : null;
  const marginPercent = margin != null && sale > 0 ? Math.round((margin / sale) * 10000) / 100 : null;
  return { materialCost, materialSale, timeCost, timeSale, auxiliaryCost, auxiliarySale, realCost, estimatedSale: sale, rawEstimatedSale: estimatedSale, margin, marginPercent, billable, warranty: workOrder.warranty === true || workOrder.economic_status === 'garantia', economicStatus: workOrder.economic_status ?? (workOrder.warranty ? 'garantia' : billable ? 'facturable' : 'pendiente') };
}

export function clientEconomicSummary(client: any) {
  const workOrders = client.work_orders ?? [];
  const quotes = client.quotes ?? [];
  const workSummaries = workOrders.map((work: any) => ({ work, summary: workOrderEconomicSummary(work) }));
  const realCost = workSummaries.reduce((sum: number, item: any) => sum + item.summary.realCost, 0);
  const estimatedSale = workSummaries.reduce((sum: number, item: any) => sum + item.summary.estimatedSale, 0);
  const quoteSale = quotes.reduce((sum: number, quote: any) => sum + Number(quote.subtotal_sale ?? quote.taxable_base ?? 0), 0);
  const quoteTotal = quotes.reduce((sum: number, quote: any) => sum + Number(quote.total_amount ?? quote.total ?? 0), 0);
  const margin = estimatedSale > 0 ? estimatedSale - realCost : quotes.reduce((sum: number, quote: any) => sum + Number(quote.estimated_margin ?? 0), 0);
  return { realCost, estimatedSale, quoteSale, quoteTotal, acceptedQuotes: quotes.filter((quote: any) => quote.status === 'Aceptado').length, executedQuotes: quotes.filter((quote: any) => quote.status === 'Ejecutado en cliente').length, warrantyCount: workSummaries.filter((item: any) => item.summary.warranty).length, billableCount: workSummaries.filter((item: any) => item.summary.billable).length, pendingInvoiceCount: workOrders.filter((work: any) => ['facturable','pendiente_facturar'].includes(work.economic_status)).length, margin };
}

export const economicService = {
  async workOrderSummaries(search = '', companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('v_work_order_economic_summary').select('*').order('scheduled_date', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    if (search) query = query.or(contains(['code', 'title', 'client_name', 'economic_status', 'status'], search));
    return expectData<any[]>(query, { service: 'economicService', operation: 'resumen economico de partes' });
  },
  async clientSummaries(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let query = supabase.from('v_client_economic_summary').select('*').order('estimated_margin_amount', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);
    return expectData<any[]>(query, { service: 'economicService', operation: 'resumen economico de clientes' });
  },
};
