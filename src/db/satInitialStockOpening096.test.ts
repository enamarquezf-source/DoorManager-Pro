import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');
const migration = read('supabase/migrations/096_allow_sat_initial_stock_opening.sql');
const preflight = read('supabase/verification/preflight_sat_initial_stock_opening_096.sql');
const postflight = read('supabase/verification/postflight_sat_initial_stock_opening_096.sql');
const app = read('src/App.tsx');
const service = read('src/services/workOrdersService.ts');

describe('096 SAT initial stock opening', () => {
  it('authorizes only SAT and the four approved operational roles', () => {
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).not.toContain("array['superadmin','SAT','Gerencia','Oficina','Tecnico']");
    expect(migration).not.toContain("array['superadmin','SAT','Gerencia','Oficina','Comercial']");
    expect(service).toContain("supabase.rpc('dmp_set_initial_warehouse_stock'");
  });

  it('preserves opening logic, tenant, audit and idempotency', () => {
    expect(migration).toContain('current_company_id()');
    expect(migration).toContain('el motivo de apertura es obligatorio');
    expect(migration).toContain('el material ya tiene una apertura en ese almacen');
    expect(migration).toContain("'initial:' || p_warehouse_id || ':' || p_material_id");
    expect(migration).toContain('created_by, notes, idempotency_key');
    expect(migration).toContain('language plpgsql security definer set search_path = public');
    expect(migration).toContain('create or replace function public.dmp_set_initial_warehouse_stock(p_warehouse_id uuid, p_material_id uuid, p_quantity numeric, p_reason text)');
  });

  it('parses migration and both read-only single-result verifications', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBe(3);
    for (const sql of [preflight, postflight]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^(?:\s*--[^\n]*\n)*\s*with\s+checks/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('audits grants and excludes technical and commercial roles in verification', () => {
    expect(preflight).toContain('has_function_privilege');
    expect(preflight).toContain('old_guard');
    expect(postflight).toContain('SAT and approved roles');
    expect(postflight).toContain('Tecnico/Comercial absent');
    expect(postflight).toContain('has_function_privilege');
    expect(postflight).toContain('security_definer');
  });
});
