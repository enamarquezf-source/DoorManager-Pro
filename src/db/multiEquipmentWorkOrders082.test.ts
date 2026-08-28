import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/082_multi_equipment_work_orders.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_multi_equipment_work_orders_082.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_multi_equipment_work_orders_082.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('multi-equipment work orders 082', () => {
  it('parses migration and both verification scripts', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('reuses the existing bridge, backfills primary equipment and supports pending checks', () => {
    expect(migration).toContain('alter table public.work_order_equipment');
    expect(migration).toContain('insert into public.work_order_equipment');
    expect(migration).toContain('equipment_selection');
    expect(migration).toContain("then 'pending_template'");
    expect(migration).toContain('generate_pending_installation_check');
    expect(migration).not.toContain('create table public.work_order_equipment');
    expect(migration).not.toContain('insert into public.work_order_materials');
    expect(migration).not.toContain('material_stock_movements');
  });

  it('loads every associated equipment and sends a collection without stock side effects', () => {
    expect(service).toContain("from('work_order_equipment')");
    expect(service).toContain('associated_equipment');
    expect(app).toContain('equipment_selection');
    expect(app).toContain('selectedEquipment.map');
    expect(app).toContain('function MultiEquipmentPicker');
    expect(app).toContain('<MultiEquipmentPicker values={values}');
    expect(app).toContain('Array.from({ length: quantity }');
    expect(app).toContain('EQUIPOS ASOCIADOS');
  });

  it('keeps verification scripts read-only', () => {
    expect(preflight + postflight).not.toMatch(/\b(insert|update|delete|alter|create|drop)\b/i);
  });
});
