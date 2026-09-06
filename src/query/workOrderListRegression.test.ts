import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hooks = readFileSync(new URL('./hooks.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const lifecycle = readFileSync(new URL('../services/entityLifecycleService.ts', import.meta.url), 'utf8');
const deployedView = readFileSync(new URL('../../supabase/migrations/022_security_lifecycle_controls.sql', import.meta.url), 'utf8');

describe('work order list regression coverage', () => {
  it('keeps the list query enabled while the profile company scope is unresolved', () => {
    const hook = hooks.slice(hooks.indexOf('export function useWorkOrderList'), hooks.indexOf('export function useWorkOrderSummary'));
    expect(hook).toContain('listWithAssignments(search, undefined');
    expect(hook).toContain('enabled: true');
    expect(hook).not.toContain('enabled: Boolean(companyId)');
  });

  it('preserves the legacy service scope and keeps the cache key tenant-aware', () => {
    const hook = hooks.slice(hooks.indexOf('export function useWorkOrderList'), hooks.indexOf('export function useWorkOrderSummary'));
    expect(hook).toContain('queryKeys.workOrders.list(companyId');
    expect(app).toContain('useWorkOrderList(companyId, debouncedSearch, archiveFilter, dateFilters)');
    expect(service).toContain('companyScope === undefined ? await currentCompanyId()');
  });

  it('confirms the explicit list projection matches the deployed lifecycle view', () => {
    const columns = ['id', 'company_id', 'code', 'title', 'description', 'type', 'priority', 'status', 'origin', 'scheduled_date', 'scheduled_time', 'case_code', 'client_code', 'client_name', 'site_code', 'site_name', 'equipment_code', 'equipment_type', 'main_technician_name', 'created_by_name', 'deleted_at'];
    const projection = `select('${columns.join(',')}')`;
    expect(service).toContain(projection);
    for (const column of columns) expect(deployedView).toContain(column);
    expect(lifecycle).toContain("query.is('deleted_at', null)");
  });

  it('passes list errors to StateBlock instead of converting them to an empty state', () => {
    expect(app).toContain('const error = listQuery.error?.message ??');
    expect(app).toContain('error={error} retry={reload} empty={!rows.length}');
  });
});
