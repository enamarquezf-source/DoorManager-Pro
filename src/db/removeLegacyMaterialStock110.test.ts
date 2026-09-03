import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/110_remove_legacy_material_stock_movements.sql');
const validator = read('supabase/verification/validate_110_functions_transactionally.sql');
const dropValidator = read('supabase/verification/validate_110_drop_transactionally.sql');
const canonicalRuntime = read('supabase/migrations/107_canonicalize_material_stock_runtime.sql');
const preflight = read('supabase/verification/preflight_remove_material_stock_movements_110.sql');
const postflight = read('supabase/verification/postflight_remove_material_stock_movements_110.sql');
const dependencyProbe = read('supabase/verification/probe_material_stock_movements_dependencies_110.sql');
const guardProbe = read('supabase/verification/probe_110_lifecycle_guard.sql');
const externalDependencyProbe = read('supabase/verification/probe_110_unknown_external_dependency.sql');
const audit = read('supabase/verification/audit_material_stock_movements_history_110.sql');
const exportSql = read('supabase/verification/export_material_stock_movements_before_110.sql');
const rowAudit = read('supabase/verification/audit_material_stock_movements_rows_110.sql');
const cleanup = read('supabase/verification/clear_material_stock_movements_before_110.sql');
const postClear = read('supabase/verification/post_clear_material_stock_movements_110.sql');
const initialSchema = read('supabase/migrations/001_initial_dmp_schema.sql');

function functionSource(name: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf('$$;', start) + 3;
  return migration.slice(start, end);
}

describe('110 remove legacy material stock movements', () => {
  it('defines the three required functions explicitly and drops without CASCADE', () => {
    for (const name of ['dmp_lifecycle_dependencies', 'dmp_lifecycle_delete_plan', 'dmp_purge_entity_with_cleanup_legacy', 'dmp_purge_entity_with_cleanup']) {
      expect(functionSource(name)).toContain(`create or replace function public.${name}`);
      expect(functionSource(name)).toContain('security definer');
      expect(functionSource(name)).toContain('set search_path = public');
    }
    expect(migration).toContain('drop table public.material_stock_movements');
    expect(migration).not.toMatch(/drop\s+(table|column|function)[^;]*cascade/i);
    expect(migration).toContain('material_stock_movements no esta vacia');
  });

  it('removes textual function mutation and limits pg_get_functiondef to assertions', () => {
    expect(migration).not.toMatch(/execute\s+v_definition/i);
    expect(migration).toContain('pg_get_functiondef');
    expect(migration).toContain('position(\'material_stock_movements\' in lower(v_definition))');
    expect(migration).not.toContain('regexp');
    expect(migration).not.toContain('overlay(');
    expect(validator).not.toMatch(/execute\s+v_definition/i);
    expect(validator).toContain('rollback;');
  });

  it('keeps canonical lifecycle semantics with valid jsonb_build_object pairs', () => {
    const dependencies = functionSource('dmp_lifecycle_dependencies');
    const deletePlan = functionSource('dmp_lifecycle_delete_plan');
    expect(dependencies).toContain("'movimientos de stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id)");
    expect(dependencies).toContain("'movimientos historicos', (select count(*) from public.stock_movements where material_id = p_entity_id)");
    expect(dependencies).not.toContain('material_stock_movements');
    expect(deletePlan).toContain("'movimientos_stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id)");
    expect(deletePlan).toContain("'movimientos_stock', (select count(*) from public.stock_movements where material_id = p_entity_id)");
    expect(deletePlan).not.toContain('movimientos_stock_nuevos');
    expect(deletePlan).not.toContain('material_stock_movements');
    expect(deletePlan).not.toMatch(/,\s*\);/);
  });

  it('keeps quote lifecycle free of direct stock ledgers', () => {
    const dependencies = functionSource('dmp_lifecycle_dependencies');
    const deletePlan = functionSource('dmp_lifecycle_delete_plan');
    const stockDefinition = initialSchema.slice(initialSchema.indexOf('create table public.stock_movements'), initialSchema.indexOf('create table public.material_requests'));
    expect(stockDefinition).not.toContain('quote_id');
    expect(dependencies).toContain("'lineas de presupuesto'");
    expect(dependencies).not.toContain("'movimientos de stock', (select count(*) from public.stock_movements where quote_id");
    expect(deletePlan).toContain("'lineas', (select count(*) from public.quote_lines where quote_id = p_entity_id)");
    expect(deletePlan).toContain("'movimientos_stock', (select count(*) from public.stock_movements where work_order_id = p_entity_id)");
    expect(deletePlan).not.toMatch(/stock_movements\s+where\s+quote_id/i);
  });

  it('keeps purge refund canonical and removes legacy cleanup paths', () => {
    const purge = functionSource('dmp_purge_entity_with_cleanup_legacy');
    expect(canonicalRuntime).toContain('dmp_refund_work_order_material_stock');
    expect(purge).toContain('perform public.dmp_refund_work_order_material_stock');
    expect(purge).toContain('delete from public.stock_movements where work_order_id = p_entity_id');
    expect(purge).not.toContain('material_stock_movements');
    expect(purge).not.toContain('stock_movements where quote_id');
    expect(purge).not.toMatch(/,\s*\);/);
  });

  it('parses the migration and all single-statement verification SQL', async () => {
    const migrationParser = await pgQuery();
    expect(migrationParser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    const validatorParser = await pgQuery();
    expect(validatorParser.parse(validator).parse_tree.stmts.length).toBeGreaterThan(0);
    const dropValidatorParser = await pgQuery();
    expect(dropValidatorParser.parse(dropValidator).parse_tree.stmts.length).toBeGreaterThan(0);
    for (const sql of [preflight, postflight, dependencyProbe, guardProbe, externalDependencyProbe, audit, exportSql, rowAudit, postClear]) {
      const parser = await pgQuery();
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate|perform)\b/im);
    }
    const cleanupParser = await pgQuery();
    expect(cleanupParser.parse(cleanup).parse_tree.stmts.length).toBe(3);
  });

  it('keeps function metadata and canonical grants explicit', () => {
    for (const source of [functionSource('dmp_lifecycle_dependencies'), functionSource('dmp_lifecycle_delete_plan')]) {
      expect(source).toContain('returns jsonb');
      expect(source).toContain('language plpgsql');
      expect(source).toContain('stable');
      expect(source).toContain('security definer');
      expect(source).toContain('set search_path = public');
    }
    expect(functionSource('dmp_purge_entity_with_cleanup_legacy')).toContain('returns jsonb');
    expect(functionSource('dmp_purge_entity_with_cleanup_legacy')).toContain('language plpgsql');
    expect(functionSource('dmp_purge_entity_with_cleanup_legacy')).toContain('security definer');
    expect(functionSource('dmp_purge_entity_with_cleanup_legacy')).toContain('set search_path = public');
    expect(migration).toContain('grant execute on function public.dmp_lifecycle_dependencies(text, uuid) to authenticated');
    expect(migration).toContain('grant execute on function public.dmp_lifecycle_delete_plan(text, uuid) to authenticated');
    expect(migration).toContain('revoke all on function public.dmp_purge_entity_with_cleanup_legacy');
  });

  it('audits all four final bodies independently and checks validator parity', () => {
    for (const name of ['dmp_lifecycle_dependencies', 'dmp_lifecycle_delete_plan', 'dmp_purge_entity_with_cleanup_legacy', 'dmp_purge_entity_with_cleanup']) {
      const source = functionSource(name);
      expect((source.match(/material_stock_movements/g) ?? []).length).toBe(0);
      expect((source.match(/stock_movements\.quote_id/g) ?? []).length).toBe(0);
      expect(validator).toContain(`create or replace function public.${name}`);
      expect(validator).toContain(`public.${name}`);
    }
    expect(migration.match(/create or replace function public\.dmp_/g)?.length).toBe(4);
    expect(validator.match(/create or replace function public\.dmp_/g)?.length).toBe(4);
    expect(validator).toContain('VALIDATE_110_FUNCTIONS_OK');
    expect(validator.trim().endsWith('rollback;')).toBe(true);
    expect(dropValidator).toContain('drop table public.material_stock_movements');
    expect(dropValidator).not.toMatch(/commit\s*;/i);
    expect(dropValidator.trim().endsWith('rollback;')).toBe(true);
    expect(dropValidator.match(/create or replace function public\.dmp_/g)?.length).toBe(4);
    expect(dropValidator).not.toMatch(/drop\s+table[^;]*cascade/i);
  });

  it('keeps dependency probes scoped to public functions and procedures', () => {
    for (const sql of [dependencyProbe, guardProbe, preflight, postflight]) {
      expect(sql).toContain("p.prokind in ('f', 'p')");
    }
    for (const branch of ['function_dependencies', 'view_dependencies', 'trigger_dependencies', 'constraint_dependencies', 'index_dependencies', 'foreign_key_dependencies', 'policy_dependencies', 'grant_dependencies']) {
      expect(dependencyProbe).toContain(`${branch} as (`);
    }
    expect(externalDependencyProbe).toContain("d.deptype = 'n'");
    expect(externalDependencyProbe).toContain("'INCOMING FK'");
    expect(externalDependencyProbe).toContain("'TRIGGER EXTERNO'");
  });

  it('keeps historical export, audit and cleanup scope safe', () => {
    for (const column of ['id', 'company_id', 'material_id', 'work_order_id', 'work_order_material_id', 'quote_id', 'movement_type', 'quantity', 'previous_stock', 'new_stock', 'unit_cost', 'reason', 'source', 'created_by', 'created_at', 'deleted_at']) expect(exportSql).toContain(`msm.${column}`);
    expect(exportSql).toContain('order by msm.created_at, msm.id');
    expect(rowAudit).toContain('m.code as material_code');
    expect(rowAudit).toContain('wo.code as work_order_code');
    expect(rowAudit).toContain('q.code as quote_code');
    expect(cleanup).toContain('delete from public.material_stock_movements;');
    expect(cleanup).not.toMatch(/truncate\b|cascade\b/i);
    expect(cleanup).not.toContain('delete from public.warehouse_stock');
    expect(cleanup).not.toContain('delete from public.stock_movements');
  });

  it('keeps preflight and postflight contracts separate', () => {
    expect(guardProbe).toContain("'phase', 'PRE-110'");
    expect(guardProbe).toContain("'known_legacy_functions'");
    expect(guardProbe).toContain("'unexpected_runtime_legacy_refs'");
    for (const check of ['legacy_table_absent', 'runtime_legacy_refs_zero', 'lifecycle_dependencies_legacy_absent', 'lifecycle_delete_plan_legacy_absent', 'purge_legacy_ref_absent', 'purge_wrapper_ref_absent', 'quote_direct_stock_relation_absent', 'warehouse_stock_present', 'stock_movements_present', 'canonical_consumption_present', 'canonical_refund_present']) expect(postflight).toContain(`'${check}'`);
  });

  it('tests the observed/expected false-positive case', () => {
    const passed = (observed: number, expected: number) => observed === expected;
    expect(passed(1, 0)).toBe(false);
    expect(passed(0, 0)).toBe(true);
    expect(guardProbe).toContain('observed = expected as passed');
  });

  it('retains the legacy stock column absence and canonical contracts', () => {
    expect(postflight).toContain("column_name = 'stock_quantity'");
    expect(postClear).toContain("'legacy_rows_zero'");
    expect(postClear).toContain("'canonical_consumption_present'");
    expect(postClear).toContain("'canonical_refund_present'");
    expect(audit).toContain("'SAFE TO DROP AFTER HISTORICAL AUDIT'");
  });
});
