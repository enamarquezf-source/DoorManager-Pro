import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/035_material_stock_control.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');

describe('material stock control 035', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('adds stock fields and movement history without physical deletes', () => {
    for (const column of ['stock_quantity', 'stock_controlled', 'allow_negative_stock', 'last_stock_movement_at']) expect(migration).toContain(column);
    expect(migration).toContain('create table if not exists public.material_stock_movements');
    expect(migration).toContain("movement_type in ('initial','in','out','adjustment','return','correction')");
    expect(migration).toContain('create policy material_stock_movements_select_scoped');
    expect(migration).not.toContain('delete from public.material_stock_movements');
  });

  it('implements stock RPCs with negative-stock guard and permissions', () => {
    expect(migration).toContain('create or replace function public.dmp_adjust_material_stock');
    expect(migration).toContain('create or replace function public.dmp_apply_material_stock_movement');
    expect(migration).toContain('if v_new < 0 and not v_material.allow_negative_stock then');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])");
    expect(migration).toContain('grant execute on function public.dmp_adjust_material_stock');
    expect(migration).not.toContain('service_role');
  });

  it('deducts and restores catalog material stock through work order material RPCs', () => {
    expect(migration).toContain('create or replace function public.dmp_upsert_work_order_material');
    expect(migration).toContain('stock_deducted_quantity');
    expect(migration).toContain("p_movement_type, p_quantity, p_reason, 'manual'");
    expect(migration).toContain("public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity");
    expect(migration).toContain("public.dmp_apply_material_stock_movement(v_usage.material_id, 'return', v_usage.stock_deducted_quantity");
    expect(migration).toContain('select id into v_id from public.work_order_materials where company_id = v_work.company_id and work_order_id = v_work.id and local_change_id = v_local');
  });

  it('exposes canonical stock adjustment and movement history', () => {
    for (const text of ['Ajustar stock', 'Ver movimientos', 'Bajo stock', 'Sin stock']) expect(app).toContain(text);
    expect(app).not.toContain('function StockAdjustModal');
    expect(app).toContain('function CanonicalStockMovementsModal');
    expect(app).toContain('materialsService.adjustStock(material.id, values)');
    expect(materialsService).toContain("from('stock_movements')");
    expect(materialsService).toContain('dmp_adjust_warehouse_stock');
  });

  it('keeps manual materials and quotes from affecting stock', () => {
    expect(app).toContain('El material manual no afecta stock');
    expect(app).toContain('Material manual / sin catálogo');
    expect(quotesService).not.toContain('stock_quantity');
    expect(workOrdersService).not.toContain(".from('materials').select('*')");
  });
});
