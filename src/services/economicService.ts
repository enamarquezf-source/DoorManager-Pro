import { supabase } from '../lib/supabase/client';
import { contains, currentCompanyId, expectData } from './query';

export const economicStatuses = ['pendiente', 'garantia', 'facturable', 'pendiente_facturar', 'facturado', 'cobrado'] as const;

export const economicService = {
  async workOrderSummary(workOrderId: string) {
    return expectData<any>(supabase.from('v_work_order_economic_summary').select('*').eq('id', workOrderId).maybeSingle(), { service: 'economicService', operation: 'resumen economico canonico de parte', resource: 'v_work_order_economic_summary' });
  },
  async clientSummary(clientId: string) {
    return expectData<any>(supabase.from('v_client_economic_summary').select('*').eq('id', clientId).maybeSingle(), { service: 'economicService', operation: 'resumen economico canonico de cliente', resource: 'v_client_economic_summary' });
  },
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
    let clientsQuery = supabase.from('v_client_economic_summary').select('*').order('estimated_margin_amount', { ascending: false });
    let metricsQuery = supabase.from('v_management_metrics').select('*').limit(1);
    if (companyId) {
      worksQuery = worksQuery.eq('company_id', companyId);
      clientsQuery = clientsQuery.eq('company_id', companyId);
      metricsQuery = metricsQuery.eq('company_id', companyId);
    }
    const [workOrders, clients, metrics] = await Promise.all([
      expectData<any[]>(worksQuery, { service: 'economicService', operation: 'dashboard partes economicas', resource: 'v_work_order_economic_summary' }),
      expectData<any[]>(clientsQuery, { service: 'economicService', operation: 'dashboard clientes economicos', resource: 'v_client_economic_summary' }),
      expectData<any>(metricsQuery.maybeSingle(), { service: 'economicService', operation: 'metricas economicas', resource: 'v_management_metrics' }),
    ]);
    return { workOrders, clients, metrics: metrics ?? {} };
  },
};
