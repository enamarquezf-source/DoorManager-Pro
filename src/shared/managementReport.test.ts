import { describe, expect, it } from 'vitest';
import { managementReport } from './managementReport';

describe('management report', () => {
  it('aggregates only selected canonical work amounts and ranks clients by their selected margin', () => {
    const report = managementReport([
      { id: 'a', client_id: 'c', sale_amount: '120', real_cost_amount: '80', margin_amount: '40', economic_status: 'pendiente_facturar', invoiced_amount: 0 },
      { id: 'b', client_id: 'c', sale_amount: 0, real_cost_amount: 15, margin_amount: -15, warranty: true },
      { id: 'c', client_id: 'd', sale_amount: 100, real_cost_amount: 20, margin_amount: 80 },
    ]);
    expect(report.metrics).toMatchObject({ sale_amount: 220, real_cost: 115, margin_amount: 105, warranty_cost: 15, pending_invoice_work_orders: 1 });
    expect(report.clients.map(row => [row.client_id, row.estimated_margin_amount])).toEqual([['d', 80], ['c', 25]]);
  });

  it('counts shared work once per employee and keeps individual time costs without duplicating team revenue', () => {
    const report = managementReport([{ id: 'a', sale_amount: 1000, real_cost_amount: 60, margin_amount: 940 }], [
      { work_order_id: 'a', profile_id: 'p', duration_minutes: 60, total_cost: 20 },
      { work_order_id: 'a', profile_id: 'p', duration_minutes: 30, hour_type: 'desplazamiento', total_cost: 10 },
      { work_order_id: 'a', profile_id: 'q', duration_minutes: 60, total_cost: 30 },
      { work_order_id: 'outside', profile_id: 'q', duration_minutes: 500, total_cost: 999 },
    ]);
    expect(report.employees).toHaveLength(2);
    expect(report.employees[0]).toMatchObject({ profile_id: 'p', workCount: 1, minutes: 90, travelMinutes: 30, cost: 30 });
    expect(report.metrics.sale_amount).toBe(1000);
  });

  it('distinguishes missing cost from an explicit zero and handles empty selections', () => {
    const report = managementReport([{ id: 'a' }], [
      { work_order_id: 'a', profile_id: 'p', duration_minutes: 60, total_cost: null },
      { work_order_id: 'a', profile_id: 'p', duration_minutes: 60, total_cost: 0 },
    ]);
    expect(report.employees[0]).toMatchObject({ cost: 0, missingCosts: 1 });
    expect(managementReport([]).clients).toEqual([]);
    expect(managementReport([]).metrics.sale_amount).toBe(0);
  });
});
