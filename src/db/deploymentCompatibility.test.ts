import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const billingService = read('../services/billingService.ts');
const billingModule = read('../modules/BillingModule.tsx');
const materialsService = read('../services/materialsService.ts');
const workOrdersService = read('../services/workOrdersService.ts');
const app = read('../App.tsx');

describe('progressive deployment compatibility', () => {
  it('degrades billing safely until 073 and 074 exist', () => {
    expect(billingService).toContain("from('invoices')");
    expect(billingService).toContain("office_validation_status");
    expect(billingService).toContain("'PGRST205'");
    expect(billingModule).toContain('Facturación pendiente de activación');
    expect(billingModule).toContain('billingService.isAvailable()');
  });

  it('does not expose an office validation action before 073', () => {
    expect(workOrdersService).toContain('hasOfficeValidation');
    expect(app).toContain('!capability.data');
    expect(workOrdersService).toContain('dmp_review_work_order_office');
  });

  it('keeps stock writes on controlled RPCs and reports missing 075 creation safely', () => {
    expect(materialsService).toContain("supabase.rpc('dmp_adjust_material_stock'");
    expect(materialsService).toContain('Creación de materiales pendiente de activación');
    expect(materialsService).not.toMatch(/from\('materials'\)\.insert/);
  });

  it('keeps checks and offline flows independent from 072-075', () => {
    const checks = read('../services/checksService.ts');
    const offline = read('../services/technicianOfflineService.ts');
    expect(checks).toContain('finish_check_safe');
    expect(offline).toContain('resetForRetry');
    expect(offline).toContain('syncSessionId');
    expect(checks).not.toContain('dmp_review_work_order_office');
    expect(offline).not.toContain('dmp_create_invoice');
  });
});
