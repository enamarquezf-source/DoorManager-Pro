import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/039_economic_work_order_summary.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const initialSchema = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const economicService = readFileSync(new URL('../services/economicService.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('economic summary 039', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('uses real work_order_materials quantity columns only', () => {
    const materialsTable = initialSchema.slice(initialSchema.indexOf('create table public.work_order_materials'), initialSchema.indexOf('-- ============================================================\n-- Comercial basico'));
    const materialTrigger = migration.slice(migration.indexOf('create or replace function public.dmp_work_order_material_set_totals_trigger'), migration.indexOf('drop trigger if exists work_order_material_set_totals_trigger'));
    expect(materialsTable).toContain('used_quantity numeric(12,2)');
    expect(materialsTable).not.toContain(' quantity numeric');
    expect(migration).toContain('coalesce(wom.used_quantity, 0)');
    expect(migration).toContain('coalesce(new.used_quantity, 0)');
    expect(migration).not.toContain('wom.quantity');
    expect(materialTrigger).not.toContain('new.quantity');
    expect(migration).not.toContain('used_quantity, quantity');
    expect(economicService).toContain("from('v_work_order_economic_summary')");
    expect(economicService).not.toContain('const materialCost');
    expect(economicService).not.toContain('const materialSale');
  });
});
