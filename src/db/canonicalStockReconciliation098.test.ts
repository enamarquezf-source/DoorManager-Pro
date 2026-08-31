import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');
const migration = read('supabase/migrations/098_canonical_stock_reconciliation.sql');
const preflight = read('supabase/verification/preflight_canonical_stock_reconciliation_098.sql');
const postflight = read('supabase/verification/postflight_canonical_stock_reconciliation_098.sql');
const transitionPostflight = read('supabase/verification/postflight_stock_transition_097_098.sql');
const app = read('src/App.tsx');
const service = read('src/services/workOrdersService.ts');

describe('098 canonical stock reconciliation', () => {
  it('persists resolution separately from canonical stock', () => {
    expect(migration).toContain('create table if not exists public.warehouse_stock_reconciliations');
    expect(migration).toContain("resolution text not null check (resolution in ('CANONICAL_CONFIRMED','CANONICAL_ADJUSTED'))");
    expect(migration).toContain('resolved_by');
    expect(migration).toContain('idempotency_key');
    expect(migration).not.toMatch(/update\s+public\.materials\s+set\s+stock_quantity/i);
    expect(migration).not.toContain('dmp_set_initial_warehouse_stock_batch');
  });

  it('accepts canonical without movement and adjusts with one signed delta movement', () => {
    expect(migration).toContain("v_action not in ('accept_canonical','adjust_canonical')");
    expect(migration).toContain("case when v_delta = 0 then 'CANONICAL_CONFIRMED' else 'CANONICAL_ADJUSTED' end");
    expect(migration).toContain("movement_type, quantity, created_by, notes, idempotency_key");
    expect(migration).toContain("'Ajuste', abs(v_delta)");
    expect(migration).toContain("'canonical-reconciliation:' || v_key");
    expect(migration).toContain("'WAREHOUSE_STOCK_RECONCILE'");
  });

  it('guards roles, tenant, multiwarehouse and idempotent retries', () => {
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).toContain('company_id = v_company_id');
    expect(migration).toContain('requiere conciliacion por almacen');
    expect(migration).toContain('conflicto: idempotency_key ya usada con otra conciliacion');
    expect(migration).toContain('for update');
  });

  it('connects the review UI to the canonical reconciliation RPC', () => {
    expect(app).toContain('function StockReconciliationPanel');
    expect(app).toContain('Aceptar stock canonico');
    expect(app).toContain('Ajustar a cantidad confirmada');
    expect(app).toContain('warehouseStockReconciliationCatalog');
    expect(app).toContain('resolveInitialStockReview');
    expect(app).toContain('Requiere conciliacion por almacen');
    expect(service).toContain("dmp_resolve_initial_stock_review");
  });

  it('keeps preflight and postflight read-only single-result', async () => {
    const parser = await pgQuery();
    for (const sql of [preflight, postflight]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^(?:\s*--[^\n]*\n)*\s*with\s+checks/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('defines a read-only single-result transition postflight', async () => {
    const parser = await pgQuery();
    expect(parser.parse(transitionPostflight).parse_tree.stmts.length).toBe(1);
    expect(transitionPostflight).toMatch(/^\s*--[^\n]*\nwith\s+central/i);
    expect(transitionPostflight).toMatch(/check_group[\s\S]*check_name[\s\S]*status[\s\S]*affected_rows[\s\S]*details/i);
    expect(transitionPostflight).toContain("'central_warehouse_rows'");
    expect(transitionPostflight).toContain("'all_15_batch_openings_once'");
    expect(transitionPostflight).toContain("'four_resolutions_complete'");
    expect(transitionPostflight).toContain("'specific_zero_without_canonical_or_initial'");
    expect(transitionPostflight).toContain('9d3fc8ef-1a24-4fb7-bb72-b11bdfb905da');
    expect(transitionPostflight).toContain('mat10_material_state');
    expect(transitionPostflight).toContain('mat10_canonical_state');
    expect(transitionPostflight).toContain('mat10_reconciliation_state');
    expect(transitionPostflight).not.toMatch(/\bmin\s*\(\s*r\.id\b/i);
    expect(transitionPostflight).not.toMatch(/\bmax\s*\(\s*[^)]*\bid\b/i);
    expect(transitionPostflight).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
  });
});
