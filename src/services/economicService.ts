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
  const rawSaleAmount = Number(workOrder.estimated_sale_amount ?? 0) || directSale || Number(workOrder.quotes?.taxable_base ?? workOrder.quotes?.subtotal_sale ?? 0);
  const billable = workOrder.billable !== false && workOrder.warranty !== true && workOrder.economic_status !== 'garantia' && workOrder.economic_status !== 'no_facturable';
  const saleAmount = billable ? Math.round(rawSaleAmount * 100) / 100 : 0;
  const marginAmount = Math.round((saleAmount - realCost) * 100) / 100;
  const marginPercentage = saleAmount > 0 ? Math.round((marginAmount / saleAmount) * 10000) / 100 : null;
  return { materialCost, materialSale, timeCost, timeSale, auxiliaryCost, auxiliarySale, realCost, saleAmount, marginAmount, marginPercentage, estimatedSale: saleAmount, rawEstimatedSale: rawSaleAmount, margin: marginAmount, marginPercent: marginPercentage, billable, warranty: workOrder.warranty === true || workOrder.economic_status === 'garantia', economicStatus: workOrder.economic_status ?? (workOrder.warranty ? 'garantia' : billable ? 'facturable' : 'pendiente') };
}

export function clientEconomicSummary(client: any) {
  const workOrders = client.work_orders ?? [];
  const quotes = client.quotes ?? [];
  const workSummaries = workOrders.map((work: any) => ({ work, summary: workOrderEconomicSummary(work) }));
  const realCost = workSummaries.reduce((sum: number, item: any) => sum + item.summary.realCost, 0);
  const acceptedOrExecuted = quotes.filter((quote: any) => ['Aceptado', 'Ejecutado en cliente'].includes(quote.status));
  const saleAmount = acceptedOrExecuted.reduce((sum: number, quote: any) => sum + Number(quote.taxable_base ?? quote.subtotal_sale ?? quote.subtotal ?? 0), 0);
  const quoteTotal = acceptedOrExecuted.reduce((sum: number, quote: any) => sum + Number(quote.total_amount ?? quote.total ?? 0), 0);
  const marginAmount = Math.round((saleAmount - realCost) * 100) / 100;
  const marginPercentage = saleAmount > 0 ? Math.round((marginAmount / saleAmount) * 10000) / 100 : null;
  const warrantyCost = workSummaries.filter((item: any) => item.summary.warranty).reduce((sum: number, item: any) => sum + item.summary.realCost, 0);
  const pendingInvoiceCount = workOrders.filter((work: any) => ['facturable','pendiente_facturar'].includes(work.economic_status) || (['Finalizado tecnicamente','Enviado','Cerrado'].includes(work.status) && Number(work.invoiced_amount ?? 0) === 0 && work.warranty !== true)).length;
  return { realCost, saleAmount, marginAmount, marginPercentage, estimatedSale: saleAmount, quoteSale: saleAmount, quoteTotal, acceptedQuotes: acceptedOrExecuted.filter((quote: any) => quote.status === 'Aceptado').length, executedQuotes: acceptedOrExecuted.filter((quote: any) => quote.status === 'Ejecutado en cliente').length, warrantyCost, warrantyCount: workSummaries.filter((item: any) => item.summary.warranty).length, billableCount: workSummaries.filter((item: any) => item.summary.billable).length, pendingInvoiceCount, margin: marginAmount };
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
  async dashboardData(companyScope?: string | null) {
    const companyId = companyScope === undefined ? await currentCompanyId() : companyScope;
    let worksQuery = supabase.from('v_work_order_economic_summary').select('*').order('scheduled_date', { ascending: false });
    let clientsQuery = supabase.from('v_client_economic_summary').select('*').order('margin_amount', { ascending: false });
    let quotesQuery = supabase.from('quotes').select('id, company_id, client_id, status, quote_type, issue_date, taxable_base, subtotal_sale, subtotal, tax_amount, total_amount, total, estimated_margin, clients!quotes_client_id_fkey(id,legal_name)').is('deleted_at', null).order('issue_date', { ascending: false });
    if (companyId) {
      worksQuery = worksQuery.eq('company_id', companyId);
      clientsQuery = clientsQuery.eq('company_id', companyId);
      quotesQuery = quotesQuery.eq('company_id', companyId);
    }
    const [workOrders, clients, quotes] = await Promise.all([
      expectData<any[]>(worksQuery, { service: 'economicService', operation: 'dashboard partes economicas', resource: 'v_work_order_economic_summary' }),
      expectData<any[]>(clientsQuery, { service: 'economicService', operation: 'dashboard clientes economicos', resource: 'v_client_economic_summary' }),
      expectData<any[]>(quotesQuery, { service: 'economicService', operation: 'dashboard presupuestos', resource: 'quotes' }),
    ]);
    return { workOrders, clients, quotes };
  },
};
