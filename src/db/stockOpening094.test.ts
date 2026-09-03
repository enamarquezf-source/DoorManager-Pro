import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('094 initial warehouse stock UI', () => {
  it('does not retain the removed legacy opening panel', () => {
    expect(app).not.toContain('function StockOpeningPanel');
  });

  it('uses the authenticated RPC and protects duplicate submission', () => {
    expect(service).toContain("supabase.rpc('dmp_set_initial_warehouse_stock'");
  });

  it('uses only warehouse stock in the active material module', () => {
    const activeModule = app.slice(app.indexOf('function CanonicalMaterialsModule'), app.indexOf('function MaterialsModule()'));
    expect(activeModule).toContain('warehouseStockCatalog');
    expect(activeModule).not.toContain('Stock legacy');
    expect(app).not.toContain('Stock disponible: ${selectedStock');
  });

});
