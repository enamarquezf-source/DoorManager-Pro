import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync('supabase/migrations/107_canonicalize_material_stock_runtime.sql', 'utf8');
const preflight = readFileSync('supabase/verification/preflight_canonical_stock_runtime_107.sql', 'utf8');
const postflight = readFileSync('supabase/verification/postflight_canonical_stock_runtime_107.sql', 'utf8');
const securityProbe = readFileSync('supabase/verification/probe_security_stock_runtime_107.sql', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const materialsService = readFileSync('src/services/materialsService.ts', 'utf8');

describe('canonical stock runtime 107', () => {
  it('creates and adjusts stock only through warehouse_stock and stock_movements', () => {
    expect(migration).toContain('dmp_adjust_warehouse_stock');
    expect(migration).toContain('insert into public.stock_movements');
    expect(migration).toContain('update public.warehouse_stock');
    expect(migration).not.toMatch(/update\s+public\.materials\s+set[^;]*stock_quantity/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.material_stock_movements/i);
  });

  it('makes validated deletion and purge refund through the usage warehouse', () => {
    expect(migration).toContain("v_usage.stock_warehouse_id");
    expect(migration).toContain("'work-order-material-return:' || v_usage.id");
    expect(migration).toContain("'Devolucion'");
  });

  it('keeps the read-only deployment checks and physical transition objects', () => {
    expect(preflight.trim().startsWith('with checks')).toBe(true);
    expect(postflight).toContain("column_name = 'stock_quantity'");
    expect(postflight).toContain("public.material_stock_movements");
  });

  it('parses migration and both single-statement verifications', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    for (const sql of [preflight, postflight, securityProbe]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^\s*with\b/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('uses explicit catalog columns and canonical visible stock', () => {
    expect(materialsService).not.toContain('stock_quantity');
    const canonicalModule = app.slice(app.indexOf('function CanonicalMaterialsModule'), app.indexOf('function MaterialsModule()'));
    expect(canonicalModule).toContain('warehouseStockCatalog');
    expect(canonicalModule).not.toContain('Stock legacy');
  });
});
