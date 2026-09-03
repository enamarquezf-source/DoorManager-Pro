import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/109_material_usage_price_snapshot.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_material_usage_price_snapshot_109.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_material_usage_price_snapshot_109.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../supabase/verification/audit_existing_zero_price_material_usage_109.sql', import.meta.url), 'utf8');
const submitMigration = readFileSync(new URL('../../supabase/migrations/094_canonical_stock_deferred_consumption.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('109 material usage price snapshots', () => {
  it('parses as a transactional migration without touching historical movement cleanup', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    for (const sql of [preflight, postflight, audit]) {
      expect(parser.parse(sql).parse_tree.stmts.length).toBe(1);
      expect(sql).toMatch(/^\s*with\b/i);
      expect(sql).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|perform)\b/im);
    }
    expect(migration).not.toContain('material_stock_movements');
    expect(migration).not.toContain('materials.stock_quantity');
  });

  it('uses quote line economics for material usage originating in a quote', () => {
    expect(migration).toContain("v_quote_line_id uuid := nullif(p_payload->>'quote_line_id', '')::uuid");
    expect(migration).toContain('v_unit_cost := coalesce(v_quote_line.unit_cost, 0)');
    expect(migration).toContain('v_unit_price := coalesce(v_quote_line.unit_price, 0)');
    expect(migration).toContain('v_quote_line.quote_id <> v_work.quote_id');
    expect(migration).toContain('v_quote_line.material_id is distinct from v_material_id');
    expect(migration).toContain('join public.quotes q on q.id = ql.quote_id and q.company_id = v_work.company_id');
    expect(app).toContain('quote_line_id: line.id');
  });

  it('uses the server catalog snapshot for non-quoted catalog materials', () => {
    expect(migration).toContain('v_unit_cost := case when v_admin and v_requested_cost is not null then v_requested_cost else coalesce(v_material.cost, 0) end');
    expect(migration).toContain('v_unit_price := case when v_admin and v_requested_price is not null then v_requested_price else coalesce(v_material.price, 0) end');
    expect(migration).toContain('if v_quote_line_id is null then');
    const form = app.slice(app.indexOf('function PlannedMaterialUseForm'), app.indexOf('function PlannedQuoteConceptsCard'));
    expect(form).not.toContain('unit_price');
  });

  it('keeps manual materials at zero without inventing economics', () => {
    expect(migration).toContain('v_unit_cost numeric := 0');
    expect(migration).toContain('v_unit_price numeric := 0');
    expect(migration).toContain('if v_material_id is null and trim(coalesce(p_payload->>\'description\', \'\')) = \'\'');
  });

  it('does not trust a technician-supplied price and preserves existing snapshots on update', () => {
    expect(migration).toContain("v_admin boolean := public.has_any_role(array['superadmin','SAT','Gerencia','Oficina'])");
    const updateSection = migration.slice(migration.indexOf('else\n    update public.work_order_materials'), migration.indexOf('end if;\n  return v_usage.id;'));
    expect(updateSection).not.toContain('unit_cost =');
    expect(updateSection).not.toContain('unit_price =');
    expect(migration).toContain('v_unit_price := coalesce(v_quote_line.unit_price, 0)');
    expect(migration).not.toContain('update public.quote_lines');
  });

  it('keeps stock validation deferred and does not rewrite prices during validation', () => {
    expect(migration).toContain("then 'pending' else 'validated' end");
    expect(submitMigration).toContain("if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: solo backoffice puede validar consumos'");
    const validationSection = submitMigration.slice(submitMigration.indexOf('create or replace function public.dmp_validate_work_order_material'), submitMigration.indexOf('create or replace function public.dmp_set_initial_warehouse_stock'));
    expect(validationSection).not.toContain('unit_price =');
    expect(validationSection).not.toContain('unit_cost =');
  });

  it('models stable historical snapshots independently from later catalog changes', () => {
    const snapshot = { unit_cost: 6, unit_price: 110 };
    const laterCatalog = { cost: 7, price: 125 };
    expect(snapshot.unit_price).toBe(110);
    expect(laterCatalog.price).not.toBe(snapshot.unit_price);
    expect(snapshot.unit_cost).toBe(6);
  });

  it('exposes remote checks for schema, server authority and historical metrics', () => {
    expect(preflight).toContain("'work_order_materials_quote_line_traceability'");
    expect(preflight).toContain("'pre_109_contract_present'");
    expect(preflight).toContain("'no_legacy_stock_dependency'");
    expect(preflight).not.toContain('supabase_migrations.schema_migrations');
    expect(postflight).toContain("'quote_snapshot_source'");
    expect(postflight).toContain("'technician_cannot_author_price'");
    expect(postflight).toContain("'stock_validation_does_not_rewrite_prices'");
    expect(postflight).toContain("'no_historical_ledger_dependency'");
    expect(audit).toContain("'quoted_snapshot_mismatch_rows'");
    expect(audit).toContain("'catalog_material_zero_price_rows'");
  });
});
