import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/040_validate_economic_calculations.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('economic validation 040', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps economic views scoped, invoker-safe and free of join multiplication', () => {
    expect(migration).toContain('with (security_invoker = true)');
    expect(migration).toContain('material_summary as');
    expect(migration).toContain('time_summary as');
    expect(migration).toContain('cost_summary as');
    expect(migration).toContain('client_work_order_summary as');
    expect(migration).toContain('work_order_summary as');
    expect(migration).toContain('group by company_id, work_order_id');
    expect(migration).toContain('group by company_id, client_id');
    expect(migration).not.toContain('left join lateral');
    expect(migration).not.toContain('left join public.v_work_order_economic_summary w on w.client_id = c.id\nleft join public.quotes q');
    expect(migration).not.toContain('sum(q.total) filter');
    expect(migration).toContain('round(coalesce(sum(coalesce(taxable_base, subtotal_sale, subtotal, 0)), 0), 2) as sale_amount');
    const workOrderView = migration.slice(migration.indexOf('create or replace view public.v_work_order_economic_summary'), migration.indexOf('create or replace view public.v_client_economic_summary'));
    expect(workOrderView).toContain('as real_cost_amount');
    expect(workOrderView.indexOf('as real_cost_amount')).toBeLessThan(workOrderView.lastIndexOf('as sale_amount'));
    expect(workOrderView.indexOf('as estimated_margin_amount')).toBeLessThan(workOrderView.indexOf('as margin_amount'));
  });

  it('uses only confirmed real economic columns and scheduled_date for work order statistics', () => {
    expect(migration).toContain('coalesce(used_quantity, 0) * coalesce(unit_cost, unit_price, 0)');
    expect(migration).toContain('coalesce(duration_minutes, 0)::numeric / 60 * coalesce(hourly_cost, 0)');
    expect(migration).toContain('coalesce(quantity, 0) * coalesce(unit_cost, 0)');
    expect(migration).toContain("where scheduled_date >= date_trunc('month', current_date)::date");
    expect(migration).not.toContain('where created_at >= date_trunc');
    expect(migration).not.toContain('work_order_materials\n  where quantity');
    expect(migration).not.toContain('wom.quantity');
  });

  it('documents the anti-duplication aggregation shape used by the SQL views', () => {
    const materialRows = [
      { company_id: 'c1', work_order_id: 'wo1', used_quantity: 2, unit_cost: 10 },
      { company_id: 'c1', work_order_id: 'wo1', used_quantity: 3, unit_cost: 20 },
    ];
    const timeRows = [
      { company_id: 'c1', work_order_id: 'wo1', duration_minutes: 60, hourly_cost: 30 },
      { company_id: 'c1', work_order_id: 'wo1', duration_minutes: 120, hourly_cost: 30 },
    ];
    const costRows = [{ company_id: 'c1', work_order_id: 'wo1', quantity: 2, unit_cost: 15 }];
    const materialCost = materialRows.reduce((sum, row) => sum + row.used_quantity * row.unit_cost, 0);
    const timeCost = timeRows.reduce((sum, row) => sum + row.duration_minutes / 60 * row.hourly_cost, 0);
    const auxiliaryCost = costRows.reduce((sum, row) => sum + row.quantity * row.unit_cost, 0);

    expect(materialCost + timeCost + auxiliaryCost).toBe(200);
    expect(materialCost + timeCost + auxiliaryCost).not.toBe((materialCost + timeCost + auxiliaryCost) * materialRows.length * timeRows.length);
    expect(migration.indexOf('from public.work_order_materials')).toBeLessThan(migration.indexOf('left join material_summary'));
    expect(migration.indexOf('from public.work_order_time_entries')).toBeLessThan(migration.indexOf('left join time_summary'));
    expect(migration.indexOf('from public.work_order_cost_entries')).toBeLessThan(migration.indexOf('left join cost_summary'));
  });

  it('updates management UI labels away from VAT-inclusive profit', () => {
    expect(app).toContain('Venta sin IVA');
    expect(app).toContain('Coste real');
    expect(app).toContain('Margen');
    expect(app).toContain('Venta sin IVA, coste real y margen');
  });
});
