import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');
const baseline = read('supabase/migrations/094_canonical_stock_deferred_consumption.sql');
const hotfix = read('supabase/migrations/095_fix_pending_material_submission.sql');
const preflight = read('supabase/verification/preflight_pending_material_submission_095.sql');
const postflight = read('supabase/verification/postflight_pending_material_submission_095.sql');
const app = read('src/App.tsx');

describe('095 pending material submission hotfix', () => {
  it('locates the exact premature opening guard in immutable 094', () => {
    const submit = baseline.slice(baseline.indexOf('create or replace function public.dmp_submit_work_order_material'), baseline.indexOf('create or replace function public.dmp_validate_work_order_material'));
    expect(submit).toContain("raise exception 'stock: el material no tiene apertura en el almacen indicado'");
    expect(submit).toContain('from public.warehouse_stock');
    expect(hotfix).not.toContain('el material no tiene apertura en el almacen indicado');
    expect(hotfix).not.toContain('from public.warehouse_stock');
  });

  it('allows catalogued pending evidence without performing stock writes', () => {
    expect(hotfix).toContain('if coalesce(v_material.stock_controlled, true) then');
    expect(hotfix).toContain("raise exception 'stock: indica el almacen de origen para validar el consumo'");
    expect(hotfix).toContain("raise exception 'stock: almacen no valido para la empresa'");
    expect(hotfix).toContain("then 'pending' else 'validated' end");
    expect(hotfix).toContain('stock_warehouse_id');
    expect(hotfix).toContain('stock_deducted_quantity');
    expect(hotfix).not.toMatch(/insert\s+into\s+public\.stock_movements/i);
    expect(hotfix).not.toMatch(/update\s+public\.warehouse_stock/i);
    expect(hotfix).not.toMatch(/update\s+public\.materials/i);
  });

  it('preserves manual materials, server economics and offline idempotency', () => {
    expect(hotfix).toContain("if v_material_id is null and trim(coalesce(p_payload->>'description', '')) = ''");
    expect(hotfix).toContain('v_local text');
    expect(hotfix).toContain('local_change_id = v_local');
    expect(hotfix).toContain('case when v_material_id is null then 0 else coalesce(v_material.cost, 0) end');
    expect(hotfix).toContain("case when v_admin then coalesce(nullif(p_payload->>'unit_price', '')::numeric, v_material.price, 0) else 0 end");
    expect(hotfix).toContain('stock_warehouse_id');
    expect(hotfix).toContain('then v_warehouse_id else null end');
  });

  it('leaves strict validation and one movement boundary in dmp_validate', () => {
    const validate = baseline.slice(baseline.indexOf('create or replace function public.dmp_validate_work_order_material'));
    expect(validate).toContain('stock_validation_status <> \'pending\'');
    expect(validate).toContain('no existe saldo abierto para el almacen');
    expect(validate).toContain('stock insuficiente');
    expect(validate).toContain('update public.warehouse_stock');
    expect(validate).toContain('insert into public.stock_movements');
    expect(validate).toContain('work_order_material_id');
    expect(validate).toContain('when unique_violation');
    expect(app).toContain('PendingMaterialValidationPanel');
  });

  it('keeps the warning visible for a proposed warehouse without opening', () => {
    expect(app).toContain('Sin apertura en este almacen. Puedes registrar el consumo');
    expect(app).toContain('Stock legacy de referencia');
  });

  it('parses the hotfix and both read-only single-result verifications', async () => {
    const parser = await pgQuery();
    expect(parser.parse(hotfix).parse_tree.stmts.length).toBe(3);
    for (const sql of [preflight, postflight]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^(?:\s*--[^\n]*\n)*\s*with\s+checks/i);
      expect(sql).toMatch(/select\s+check_group/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('audits signatures, security, grants and immutable migration boundary', () => {
    expect(hotfix).toContain('create or replace function public.dmp_submit_work_order_material(p_payload jsonb)');
    expect(hotfix).toContain('language plpgsql security definer set search_path = public');
    expect(baseline).toContain('grant execute on function public.dmp_submit_work_order_material(jsonb) to authenticated');
    expect(baseline).toContain('grant execute on function public.dmp_validate_work_order_material(uuid) to authenticated');
    expect(preflight).toContain('pg_get_functiondef');
    expect(postflight).toContain('pg_get_functiondef');
    expect(postflight).toContain('has_function_privilege');
  });
});
