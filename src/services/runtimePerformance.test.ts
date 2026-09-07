import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const workOrders = readFileSync(new URL('./workOrdersService.ts', import.meta.url), 'utf8');
const alerts = readFileSync(new URL('./alertsService.ts', import.meta.url), 'utf8');
const dashboards = readFileSync(new URL('./dashboardService.ts', import.meta.url), 'utf8');
const clients = readFileSync(new URL('./clientsService.ts', import.meta.url), 'utf8');
const sites = readFileSync(new URL('./sitesService.ts', import.meta.url), 'utf8');
const equipment = readFileSync(new URL('./equipmentService.ts', import.meta.url), 'utf8');

describe('runtime performance boundaries', () => {
  it('loads independent work-order detail sections concurrently', () => {
    const detail = workOrders.slice(workOrders.indexOf('async getWorkOrderFullDetail'), workOrders.indexOf('async create(', workOrders.indexOf('async getWorkOrderFullDetail')));
    expect(detail).toContain('await Promise.all([');
    expect(detail).not.toContain("const associated = await expectStep('Detalle parte / equipos asociados'");
    expect(detail).not.toContain("const photos = await expectStep('Detalle parte / fotos'");
    expect(detail).not.toContain("work_order_equipment').select('id,");
    expect(detail).toContain("work_order_equipment').select('*, equipment!");
  });

  it('debounces dependency-driven legacy reloads after the first result', () => {
    const loader = app.slice(app.indexOf('function useLoad<'), app.indexOf('function HomePage('));
    expect(loader).toContain('debounceDependencies = false');
    expect(loader).toContain('const delay = debounceDependencies && loadedRef.current ? 250 : 0');
    expect(loader).toContain('window.clearTimeout(timer)');
    expect(app).toContain('clientsService.list(search, scope, archiveFilter), [search, scope, archiveFilter], [] as any[], true');
    expect(app).toContain('clientsService.get(id), [id], null as any);');
  });

  it('counts unread alerts without downloading every alert', () => {
    expect(alerts).toContain("select('id', { count: 'exact', head: true })");
    expect(app).toContain('alertsService.unreadCount().then(setUnread)');
    expect(app).toContain("}, [profile?.id]);");
  });

  it('keeps infrequent economic modules out of the initial bundle', () => {
    expect(app).toContain("lazy(() => import('./modules/BillingModule')");
    expect(app).toContain("lazy(() => import('./components/WarrantyBillingDecisionPanel')");
    expect(app).toContain("lazy(() => import('./components/EconomicReviewPanel')");
    expect(app).not.toContain("import { BillingModule } from './modules/BillingModule'");
  });

  it('does not load unused commercial and management dashboard collections', () => {
    const commercial = dashboards.slice(dashboards.indexOf('async getCommercialDashboardData'), dashboards.indexOf('async getOfficeDashboardData'));
    const management = dashboards.slice(dashboards.indexOf('async getManagementDashboardData'), dashboards.indexOf('async getTechnicianDailyWork'));
    expect(commercial).not.toContain("supabase.from('alerts')");
    expect(commercial).not.toContain("supabase.from('v_work_order_full_detail')");
    expect(management).not.toContain("supabase.from('opportunities')");
    expect(management).not.toContain("supabase.from('quotes')");
  });

  it('keeps list queries lightweight while detail queries own full relationships', () => {
    const clientList = clients.slice(clients.indexOf('async list('), clients.indexOf('async get('));
    const siteList = sites.slice(sites.indexOf('async list('), sites.indexOf('async get('));
    const equipmentList = equipment.slice(equipment.indexOf('async list('), equipment.indexOf('async types('));
    expect(clientList).not.toContain('client_contacts!');
    expect(clientList).not.toContain('work_orders!');
    expect(siteList).not.toContain('site_contacts!');
    expect(siteList).not.toContain('work_orders!');
    expect(equipmentList).not.toContain('equipment_components!');
  });
});
