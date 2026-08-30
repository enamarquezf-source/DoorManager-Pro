import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');
const migration = read('supabase/migrations/097_bulk_initial_stock_opening.sql');
const preflight = read('supabase/verification/preflight_bulk_initial_stock_097.sql');
const postflight = read('supabase/verification/postflight_bulk_initial_stock_097.sql');
const app = read('src/App.tsx');
const service = read('src/services/workOrdersService.ts');

describe('097 bulk initial stock opening', () => {
  it('uses a single atomic batch RPC with explicit items and reason', () => {
    expect(migration).toContain('create or replace function public.dmp_set_initial_warehouse_stock_batch(p_payload jsonb)');
    expect(migration).toContain('jsonb_to_recordset(v_items)');
    expect(migration).toContain('insert into public.warehouse_stock');
    expect(migration).toContain('insert into public.stock_movements');
    expect(migration).toContain('v_reason text');
    expect(migration).toContain('v_source text');
    expect(migration).toContain('v_batch_key text');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('initial-batch:');
    expect(migration).not.toMatch(/update\s+public\.materials\s+set\s+stock_quantity/i);
    expect(migration).not.toMatch(/purchase|supplier|receipt|reservation/i);
  });

  it('rejects invalid, duplicate, cross-company and already opened items', () => {
    expect(migration).toContain('falta idempotency_key');
    expect(migration).toContain("coalesce(jsonb_typeof(v_items), '') <> 'array'");
    expect(migration).toContain('coalesce(jsonb_array_length(v_items), 0) = 0');
    expect(migration).toContain('la cantidad de apertura debe ser mayor que cero');
    expect(migration).toContain('no se puede repetir un material en el lote');
    expect(migration).toContain('el material ya tiene una apertura en ese almacen');
    expect(migration).toContain('el material tiene stock canonico y requiere revision');
    expect(migration).toContain('la clave idempotente ya se uso con otro lote');
    expect(migration).toContain('company_id = public.current_company_id()');
    expect(migration).toContain('company_id = v_warehouse.company_id');
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
  });

  it('keeps one movement per material and idempotent retries', () => {
    expect(migration).toContain('returning id into v_first_movement');
    expect(migration).toContain("idempotency_key like 'initial-batch:' || v_batch_key || ':%'");
    expect(migration).toContain('if v_first_movement is not null then');
    expect(migration).toContain('return v_first_movement;');
    expect(migration).toContain('created_by, notes, idempotency_key');
  });

  it('exposes controlled classification, selection, editable proposals and confirmation', () => {
    expect(app).toContain('function StockOpeningBulkPanel');
    expect(app).toContain('LEGACY_ONLY_POSITIVE');
    expect(app).toContain('LEGACY_ONLY_ZERO');
    expect(app).toContain('MISMATCH');
    expect(app).toContain('Seleccionar candidatos validos');
    expect(app).toContain('Cantidad a abrir');
    expect(app).toContain('warehouse_id: confirmation.warehouseId');
    expect(app).toContain('idempotency_key: confirmation.idempotency_key');
    expect(app).toContain('Ya abiertos');
    expect(app).toContain('Apertura inicial masiva');
  });

  it('uses the batch service instead of looping individual RPC calls', () => {
    expect(service).toContain("supabase.rpc('dmp_set_initial_warehouse_stock_batch'");
    expect(app).toContain('workOrdersService.openInitialWarehouseStockBatch');
    expect(app).not.toContain('for (const item of confirmation.items)');
  });

  it('labels legacy adjustment separately from canonical stock', () => {
    expect(app).toContain('Ajustar stock legacy');
    expect(app).toContain('Esta acción modifica únicamente el stock legacy global');
    expect(app).toContain('Stock canónico total informativo');
    expect(app).toContain('No implica disponibilidad en un almacén concreto');
  });

  it('parses migration and both read-only single-result verifications', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBe(6);
    for (const sql of [preflight, postflight]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^(?:\s*--[^\n]*\n)*\s*with\s+checks/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('audits permissions, tenant, legacy immutability and no purchase scope', () => {
    expect(preflight).toContain('candidate_counts');
    expect(preflight).toContain('review_counts');
    expect(preflight).toContain('batch signature absent before 097');
    expect(postflight).toContain('has_function_privilege');
    expect(postflight).toContain('technical/commercial absent');
    expect(postflight).toContain('legacy/purchases/reservations untouched');
    expect(postflight).toContain('current_company_id');
  });
});
