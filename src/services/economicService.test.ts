import { describe, expect, it } from 'vitest';
import { clientEconomicSummary, workOrderEconomicSummary } from './economicService';

describe('economic service calculations', () => {
  it('calculates a work order from materials, hours and auxiliary costs', () => {
    const summary = workOrderEconomicSummary({
      estimated_sale_amount: 5000,
      materials: [{ used_quantity: 1, unit_cost: 3100, unit_price: 3100 }],
      time_entries: [{ duration_minutes: 300, hourly_cost: 100, hourly_price: 100 }],
      cost_entries: [{ cost_type: 'desplazamiento', quantity: 1, unit_cost: 100, unit_price: 100 }],
    });
    expect(summary.realCost).toBe(3700);
    expect(summary.saleAmount).toBe(5000);
    expect(summary.marginAmount).toBe(1300);
    expect(summary.marginPercentage).toBe(26);
  });

  it('separates client quote sale from accumulated real work order cost', () => {
    const summary = clientEconomicSummary({
      work_orders: [
        { materials: [{ used_quantity: 1, unit_cost: 1000 }], time_entries: [], cost_entries: [] },
        { warranty: true, materials: [{ used_quantity: 2, unit_cost: 250 }], time_entries: [], cost_entries: [] },
      ],
      quotes: [
        { status: 'Aceptado', taxable_base: 2500, total_amount: 3025 },
        { status: 'Ejecutado en cliente', taxable_base: 1500, total_amount: 1815 },
        { status: 'Borrador', taxable_base: 9999, total_amount: 9999 },
      ],
    });
    expect(summary.realCost).toBe(1500);
    expect(summary.saleAmount).toBe(4000);
    expect(summary.quoteTotal).toBe(4840);
    expect(summary.marginAmount).toBe(2500);
    expect(summary.warrantyCost).toBe(500);
    expect(summary.warrantyCount).toBe(1);
  });
});
