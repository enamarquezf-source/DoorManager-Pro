import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync('supabase/migrations/108_remove_legacy_material_stock_quantity.sql', 'utf8');
const preflight = readFileSync('supabase/verification/preflight_remove_legacy_material_stock_108.sql', 'utf8');
const postflight = readFileSync('supabase/verification/postflight_remove_legacy_material_stock_108.sql', 'utf8');
const probe = readFileSync('supabase/verification/probe_legacy_stock_dependencies_108.sql', 'utf8');

describe('108 remove legacy material stock', () => {
  it('drops only the legacy column and explicitly removes the retired endpoints', () => {
    expect(migration).toContain('alter table public.materials drop column stock_quantity');
    expect(migration).not.toMatch(/drop\s+(table|column|function)[^;]*cascade/i);
    expect(migration).toContain('drop function if exists public.dmp_apply_material_stock_movement');
    expect(migration).toContain('drop function if exists public.dmp_adjust_material_stock');
    expect(migration).not.toContain('drop table public.material_stock_movements');
  });

  it('moves lifecycle stock_active to the canonical multi-warehouse total', () => {
    expect(migration).toContain("to_regprocedure('public.dmp_lifecycle_delete_plan(text,uuid)')");
    expect(migration).toContain('select sum(ws.quantity) from public.warehouse_stock ws where ws.material_id = p_entity_id');
    expect(migration).toContain('select sum(ws.quantity) from public.warehouse_stock ws where ws.material_id = p_entity_id), 0) > 0');
    expect(migration).toContain('lifecycle delete plan todavía contiene stock_quantity');

    const stockActive = (warehouseQuantities: number[]) => warehouseQuantities.reduce((total, quantity) => total + quantity, 0) > 0;
    expect(stockActive([3])).toBe(true);
    expect(stockActive([])).toBe(false);
    expect(stockActive([0])).toBe(false);
    expect(stockActive([2, 3])).toBe(true);
  });

  it('removes legacy stock reads and writes while retaining historical movement cleanup', () => {
    expect(migration).toContain("to_regprocedure('public.dmp_purge_entity_with_cleanup_legacy(text,uuid,text,text,jsonb,boolean,boolean)')");
    expect(migration).toContain('select sum(ws.quantity) from public.warehouse_stock ws where ws.material_id = p_entity_id');
    expect(migration).toContain('purge legacy todavía contiene stock_quantity');
    expect(migration).not.toContain('delete from public.material_stock_movements');
    expect(postflight).toContain("'purge_legacy_historical_cleanup'");
  });

  it('parses migration, preflight, postflight and dependency probe', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    for (const sql of [preflight, postflight, probe]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^\s*with\b/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
  });

  it('keeps canonical stock and movement contracts in the postflight', () => {
    expect(postflight).toContain("'legacy_column_removed'");
    expect(postflight).toContain("'canonical_stock_present'");
    expect(postflight).toContain("'canonical_ledger_present'");
    expect(postflight).toContain("'material_stock_movements_retained'");
    expect(postflight).toContain("'runtime_stock_quantity_refs_zero'");
  });

  it('keeps preflight and postflight independent of migration bookkeeping tables', () => {
    expect(preflight).toContain("'pre_108_contract_present'");
    expect(preflight).not.toContain('supabase_migrations.schema_migrations');
    expect(postflight).toContain("'runtime_stock_quantity_refs_zero'");
    expect(postflight).toContain("'lifecycle_uses_canonical_stock'");
    expect(postflight).not.toContain('supabase_migrations.schema_migrations');
  });

  it('filters pg_proc before calling pg_get_functiondef', () => {
    expect(probe).toContain('functions as materialized');
    expect(probe).toContain("p.prokind in ('f', 'p')");
    const functionSection = probe.slice(probe.indexOf('function_dependencies'), probe.indexOf('view_dependencies'));
    expect(functionSection).toContain('from functions fn');
    expect(functionSection).not.toContain('n.nspname');
    expect(functionSection).not.toContain('p.proname');
  });

  it('keeps each dependency branch on the shared output contract', () => {
    for (const branch of [
      'function_dependencies',
      'view_dependencies',
      'trigger_dependencies',
      'constraint_dependencies',
      'expression_dependencies',
      'index_dependencies',
      'other_catalog_dependencies',
    ]) {
      expect(probe).toContain(`${branch} as (`);
    }
    expect(probe).toContain('pg_get_viewdef(view_class.oid, true)');
    expect(probe).toContain('pg_get_triggerdef(trigger_def.oid)');
    expect(probe).toContain('pg_get_constraintdef(constraint_def.oid)');
    expect(probe).toContain('pg_get_expr(expression_default.adbin, expression_default.adrelid)');
    expect(probe).toContain('pg_get_indexdef(index_class.oid)');
    expect(probe).toContain('union all select * from other_catalog_dependencies');
  });
});
