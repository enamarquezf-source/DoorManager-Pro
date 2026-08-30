import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/094_canonical_stock_deferred_consumption.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const verification = [
  'supabase/verification/preflight_canonical_stock_094.sql',
  'supabase/verification/postflight_canonical_stock_094.sql',
  'supabase/verification/probe_stock_model_reconciliation_094.sql',
  'supabase/verification/probe_stock_bootstrap_context_094.sql',
].map((file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));

describe('094 canonical warehouse stock', () => {
  it('adds pending validation and immutable movement linkage', () => {
    expect(migration).toContain("stock_validation_status in ('pending', 'validated', 'rejected')");
    expect(migration).toContain('stock_warehouse_id');
    expect(migration).toContain('stock_movement_id');
    expect(migration).toContain('work_order_material_id uuid references public.work_order_materials(id)');
    expect(migration).toContain('stock_movements_work_order_material_once');
    expect(migration).toContain('revoke all on function public.dmp_upsert_work_order_material(jsonb) from authenticated');
  });

  it('requires explicit warehouse and existing opening balance', () => {
    expect(migration).toContain("raise exception 'stock: indica el almacen de origen para validar el consumo'");
    expect(migration).toContain("raise exception 'stock: el material no tiene apertura en el almacen indicado'");
    expect(migration).toContain('if not exists (select 1 from public.warehouse_stock');
    expect(migration).toContain('create or replace function public.dmp_set_initial_warehouse_stock');
    expect(migration).toContain('el motivo de apertura es obligatorio');
    expect(migration).not.toContain('update public.materials set stock_quantity');
    const consumptionSection = migration.slice(0, migration.indexOf('create or replace function public.dmp_set_initial_warehouse_stock'));
    expect(consumptionSection).not.toContain('insert into public.warehouse_stock');
  });

  it('keeps manual material outside stock and validates only backoffice', () => {
    expect(migration).toContain("then 'pending' else 'validated' end");
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).toContain('solo backoffice puede validar consumos');
    expect(migration).toContain("array['superadmin','Gerencia','Oficina']");
    expect(migration).toContain('solo Oficina, Gerencia o superadmin puede abrir stock inicial');
    expect(migration).not.toMatch(/dmp_set_initial_warehouse_stock[\s\S]*?array\['superadmin','SAT','Gerencia','Oficina'\]/);
    expect(migration).toContain("movement_type, quantity, work_order_id, created_by, notes, work_order_material_id");
  });

  it('exposes the administrative queue without giving technicians the action', () => {
    expect(app).toContain('function PendingMaterialValidationPanel');
    expect(app).toContain('VALIDAR CONSUMO');
    expect(app).toContain('MATERIAL MANUAL · Pendiente de conciliacion');
    expect(app).toContain('workOrdersService.validateMaterialStock');
    expect(app).toContain("['superadmin', 'SAT', 'Gerencia', 'Oficina']");
  });

  it('audits role guards from function definitions without invoking RPCs', () => {
    const postflight = verification[1];
    expect(postflight).toContain('pg_get_functiondef');
    expect(postflight).toContain('exact allowed values inspected');
    expect(postflight).not.toMatch(/\b(select|perform)\s+public\.(dmp_validate_work_order_material|dmp_set_initial_warehouse_stock)\s*\(/i);
  });

  it('parses migration and keeps verification read-only', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    for (const sql of verification) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('keeps the active sequence unambiguous', () => {
    expect(migration).not.toContain('095_canonical_stock');
  });
});
