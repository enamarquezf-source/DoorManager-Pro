import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/049_single_company_mode.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const queryService = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');
const superadminService = readFileSync(new URL('../services/superadminService.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const checksService = readFileSync(new URL('../services/checksService.ts', import.meta.url), 'utf8');
const hourRatesService = readFileSync(new URL('../services/hourRatesService.ts', import.meta.url), 'utf8');
const offlineService = readFileSync(new URL('../services/technicianOfflineService.ts', import.meta.url), 'utf8');
const migration048 = readFileSync(new URL('../../supabase/migrations/048_fix_finalize_and_installation_flow.sql', import.meta.url), 'utf8');
const migration045 = readFileSync(new URL('../../supabase/migrations/045_finalize_work_order_technical.sql', import.meta.url), 'utf8');
const migration047 = readFileSync(new URL('../../supabase/migrations/047_work_order_planned_quote_lines.sql', import.meta.url), 'utf8');
const migration035 = readFileSync(new URL('../../supabase/migrations/035_material_stock_control.sql', import.meta.url), 'utf8');

describe('049 single-company mode', () => {
  it('parses and stays non-destructive', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(companies|clients|sites|equipment|quotes|work_orders|materials)/i);
    expect(migration).not.toContain('service_role');
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/i);
  });

  it('resolves exactly one active operating company and refuses ambiguous data', () => {
    expect(migration).toContain('create or replace function public.dmp_operating_company_id()');
    expect(migration).toContain('where active = true');
    expect(migration).toContain('and deleted_at is null');
    expect(migration).toContain('if v_count = 1 then');
    expect(migration).toContain('Hay varias empresas activas');
    expect(migration).toContain('dmp_single_company_audit');
  });

  it('adds fiscal fields for Datos de empresa without changing customer tables', () => {
    for (const field of ['trade_name', 'address', 'postal_code', 'city', 'province', 'country', 'website', 'logo_url', 'fiscal_notes']) {
      expect(migration).toContain(`alter table public.companies add column if not exists ${field}`);
    }
    expect(app).toContain('function CompanySettingsModule');
    expect(app).toContain('Datos de empresa');
    expect(app).toContain('Empresa operadora emisora para futura facturación.');
    expect(superadminService).toContain('operatingCompany()');
    expect(superadminService).toContain('updateOperatingCompany');
  });

  it('centralizes frontend company resolution and removes manual superadmin selection', () => {
    expect(queryService).toContain("supabase.rpc('dmp_operating_company_id')");
    for (const forbidden of ['SuperadminCompanyScope', 'useSuperadminScope', 'dmp-superadmin-company-scope', 'Empresa seleccionada', 'Selecciona una empresa', 'selectedCompanyId']) {
      expect(app).not.toContain(forbidden);
    }
    expect(permissions).toContain('if (scope.platformScope === true && hasAny(profile, [\'superadmin\'])) return true;');
  });

  it('keeps create flows assigning company_id through the central resolver or parent rows', () => {
    expect(quotesService).toContain('payload.company_id || await currentCompanyId()');
    expect(workOrdersService).toContain('payload.company_id || await currentCompanyId()');
    expect(materialsService).toContain('payload.company_id || await currentCompanyId()');
    expect(checksService).toContain('payload.company_id || await currentCompanyId()');
    expect(hourRatesService).toContain('payload.company_id || await currentCompanyId()');
    expect(superadminService).not.toContain('Debes seleccionar una empresa');
    expect(migration).toContain("v_company_id uuid := coalesce(nullif(p_profile->>'company_id', '')::uuid, public.dmp_operating_company_id())");
  });

  it('preserves critical quote-to-work-order, installation, stock and closeout flows', () => {
    expect(migration048).toContain('create or replace function public.create_work_order_full(p_payload jsonb)');
    expect(migration048).toContain('insert into public.equipment(company_id, code, client_id, site_id');
    expect(migration048).toContain('insert into public.checks(company_id, code, work_order_id, equipment_id, template_id, technician_id)');
    expect(migration047).toContain('dmp_set_work_order_quote_line_decision');
    expect(migration035).toContain('dmp_apply_material_stock_movement');
    expect(workOrdersService).toContain('dmp_upsert_work_order_material');
    expect(migration045).toContain('dmp_finalize_work_order_technical');
  });

  it('keeps offline queue shape compatible with companyId payloads and retries', () => {
    expect(offlineService).toContain('companyId?: string');
    expect(offlineService).toContain('syncSelected');
    expect(offlineService).toContain('resetForRetry');
    expect(app).toContain('Reintentar seleccionados');
    expect(app).toContain('Borrar seleccionados');
  });
});
