import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const service = readFileSync(new URL('./economicService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('canonical economic consumers', () => {
  it('uses SQL summaries instead of local economic calculators', () => {
    expect(service).toContain("from('v_work_order_economic_summary')");
    expect(service).toContain("from('v_client_economic_summary')");
    expect(service).toContain("from('v_management_metrics')");
    expect(service).not.toContain('function workOrderEconomicSummary');
    expect(service).not.toContain('function clientEconomicSummary');
    expect(app).not.toContain('plannedVsRealSummary');
    expect(app).not.toContain('clientEconomicSummary(');
  });

  it('uses canonical summaries in the close modal and client detail', () => {
    expect(app).toContain('economicService.workOrderSummary(workOrder.id)');
    expect(app).toContain('economicService.clientSummary(id)');
    expect(app).toContain("'Venta presupuestada'");
    expect(app).toContain("'Venta adicional'");
    expect(app).toContain("'Venta total'");
    expect(app).toContain("'Coste real'");
    expect(app).toContain("'Margen'");
  });

  it('does not leave an accessible quote plus additional margin formula', () => {
    expect(app).not.toContain('quotes.reduce');
    expect(app).not.toContain('quoteSale - materialCost');
    expect(app).not.toContain('saleAmount - realCost');
  });
});
