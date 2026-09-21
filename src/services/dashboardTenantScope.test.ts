import { afterEach, describe, expect, it, vi } from 'vitest';

const queryCalls: { table: string; filters: [string, string, unknown][] }[] = [];

function queryFor(table: string) {
  const query: any = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      queryCalls.find((item) => item.table === table)?.filters.push(['eq', column, value]);
      return query;
    },
    gte: () => query,
    in: () => query,
    is: () => query,
    order: () => query,
    then: (resolve: (value: { data: any[]; error: null }) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
  };
  queryCalls.push({ table, filters: [] });
  return query;
}

vi.mock('../lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => queryFor(table),
    rpc: vi.fn((name: string) => name === 'dmp_operating_company_id' ? Promise.resolve({ data: 'company-a', error: null }) : Promise.resolve({ data: null, error: null })),
  },
}));

vi.mock('./query', async () => {
  const actual = await vi.importActual<typeof import('./query')>('./query');
  return { ...actual, currentProfileCompanyId: vi.fn(async () => 'company-a'), currentProfileId: vi.fn(async () => 'technician-a') };
});

describe('dashboard tenant scope', () => {
  afterEach(() => {
    queryCalls.length = 0;
  });

  it.each([
    ['getSatDashboardData', ['v_work_order_full_detail', 'work_order_assignments', 'profiles', 'v_pending_checks', 'v_completed_checks', 'deficiencies', 'alerts', 'work_order_materials']],
    ['getCommercialDashboardData', ['opportunities', 'quotes', 'deficiencies', 'alerts', 'clients', 'v_work_order_full_detail']],
    ['getOfficeDashboardData', ['documents', 'materials', 'material_requests', 'work_order_materials', 'alerts', 'v_work_order_full_detail', 'suppliers']],
    ['getManagementDashboardData', ['v_management_metrics', 'v_work_order_full_detail', 'deficiencies', 'alerts', 'clients', 'opportunities', 'quotes']],
  ] as const)('%s applies the profile company to every scoped source', async (method, tables) => {
    const { dashboardService } = await import('./dashboardService');

    await dashboardService[method]();

    for (const table of tables) {
      expect(queryCalls.find((item) => item.table === table)?.filters).toContainEqual(['eq', 'company_id', 'company-a']);
    }
  });

  it('does not alter the technician daily work scope', async () => {
    const { dashboardService } = await import('./dashboardService');

    await dashboardService.getTechnicianDailyWork('2026-08-22');

    expect(queryCalls.find((item) => item.table === 'v_technician_daily_schedule')?.filters).toContainEqual(['eq', 'technician_id', expect.anything()]);
    expect(queryCalls.find((item) => item.table === 'v_pending_checks')?.filters).toContainEqual(['eq', 'technician_id', expect.anything()]);
  });

  it('loads the Superadmin overview from the current company without platform scope', async () => {
    const client = await import('../lib/supabase/client');
    const { superadminService } = await import('./superadminService');

    await superadminService.overview();

    expect(client.supabase.rpc).not.toHaveBeenCalledWith('superadmin_global_overview', { p_company_id: null });
    for (const table of ['profiles', 'clients', 'sites', 'equipment', 'work_orders', 'checks', 'activity_log', 'audit_log']) {
      expect(queryCalls.find((item) => item.table === table)?.filters).toContainEqual(['eq', 'company_id', 'company-a']);
    }
    expect(queryCalls.find((item) => item.table === 'companies')?.filters).toContainEqual(['eq', 'id', 'company-a']);
  });
});
