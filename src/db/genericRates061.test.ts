import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/061_normalize_operational_rate_catalog.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration058 = readFileSync(new URL('../../supabase/migrations/058_fix_work_order_material_economics.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration059 = readFileSync(new URL('../../supabase/migrations/059_prevent_duplicate_work_order_costs.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration060 = readFileSync(new URL('../../supabase/migrations/060_generic_rates_and_economic_integrity.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('061 operational rate catalog normalization', () => {
  it('is transactional and leaves prior migrations untouched', () => {
    expect(migration).toContain('begin;');
    expect(migration).toContain('commit;');
    expect(migration058).not.toContain('061_normalize_operational_rate_catalog');
    expect(migration059).not.toContain('061_normalize_operational_rate_catalog');
    expect(migration060).not.toContain('061_normalize_operational_rate_catalog');
  });

  it('preflights the four exact source rates and legacy references', () => {
    for (const value of [
      "('Técnico', 22, 110, '2026-08-14', null)",
      "('Desplazamiento', 35, 55, '2026-08-14', null)",
      "('Grúa', 38, 95, '2026-08-20', null)",
      "('Plataforma elevadora PEMP', 38, 250, '2026-08-20', null)",
    ]) expect(migration).toContain(value);
    expect(migration).toContain('fuente legacy incompatible o ambigua');
    expect(migration).toContain('tiene referencias operativas');
    expect(migration).toContain('version legacy de Técnico incompatible o ambigua');
  });

  it('uses company_id + legacy_code to resolve catalog_id dynamically, never source UUID as catalog.id', () => {
    expect(migration).toContain('create temp table dmp_061_legacy');
    expect(migration).toContain('source_rate_id uuid primary key');
    expect(migration).toContain('legacy_code text not null');
    expect(migration).not.toMatch(/\bid uuid primary key\b/);
    expect(migration).toContain("select c.id into v_catalog_id");
    expect(migration).toContain('where c.company_id');
    expect(migration).toContain("and c.code = e.legacy_code");
    expect(migration).not.toContain("c.id = e.id");
    expect(migration).not.toMatch(/c\.id\s*=\s*e\.source_rate_id/);
  });

  it('resolves catalog_id dynamically for all four legacy concepts', () => {
    const codes = [
      'legacy-cost-b05f7d96-e166-403a-8aea-432ef7ef764e',
      'legacy-cost-4ac78458-45e3-4088-8a57-8dec8127c4cc',
      'legacy-cost-7de2c892-ecf4-41af-a77d-200bef3e3bd8',
      'legacy-hour-d54e03d2-b18f-48d6-aae8-ba52f88fc7f2',
    ];
    for (const code of codes) {
      expect(migration).toContain(code);
    }
    expect(migration).toContain("c.code = e.legacy_code");
  });

it('validates exactly one catalog row per legacy code, no LIMIT 1', () => {
    expect(migration).toContain("select c.id into v_catalog_id");
    expect(migration).toContain('where c.company_id');
    expect(migration).toContain("and c.code = e.legacy_code");
    expect(migration).toContain("v_catalog_id is null");
    expect(migration).toContain("v_catalog_count <> 1");
    const catalogLookup = migration.slice(migration.indexOf("select c.id into v_catalog_id"), migration.indexOf("if v_catalog_id is null"));
    expect(catalogLookup).not.toMatch(/limit 1/i);
  });

  it('uses resolved catalog_id for all reference checks (rate_id, concept_id, rate_version_id)', () => {
    expect(migration).toContain('t.rate_id = v_catalog_id');
    expect(migration).toContain('v.rate_id = v_catalog_id');
    expect(migration).toContain('c.concept_id = v_catalog_id');
    expect(migration).toContain('c.rate_id = v_catalog_id');
    expect(migration).toContain('q.concept_id = v_catalog_id');
    expect(migration).toContain('rate_id = v_catalog_id');
    expect(migration).not.toMatch(/rate_id = e\.id/);
    expect(migration).not.toMatch(/concept_id = e\.id/);
  });

  it('archives legacy rate version using resolved catalog_id, not source UUID', () => {
    expect(migration).toContain('v_catalog_id');
    expect(migration).toContain("v.rate_id = v_catalog_id");
    expect(migration).toContain("v.cost_amount = 22 and v.sale_amount = 110");
    expect(migration).toContain("v.valid_from = '2026-08-14'");
    expect(migration).toContain('v_version_id');
    expect(migration).toContain('where v.id = v_version_id');
    expect(migration).not.toMatch(/rate_id\s*=\s*['"]d54e03d2/);
  });

  it('archives legacy concepts using resolved catalog_id or legacy_code, not source UUID', () => {
    expect(migration).toContain("c.code = e.legacy_code");
    expect(migration).toContain('v_catalog_id');
    expect(migration).toContain('where c.id = v_catalog_id');
    expect(migration).not.toMatch(/c\.id\s+IN\s*\(\s*['"]b05f7d96/);
    expect(migration).not.toMatch(/c\.id\s+IN\s*\(\s*['"]4ac78458/);
    expect(migration).not.toMatch(/c\.id\s+IN\s*\(\s*['"]7de2c892/);
    expect(migration).not.toMatch(/c\.id\s+IN\s*\(\s*['"]d54e03d2/);
  });

  it('accepts already-archived PEMP legacy (active=false, deleted_at NOT NULL)', () => {
    expect(migration).toContain('v_catalog_id');
    expect(migration).not.toMatch(/c\.active\s*=\s*true/);
    expect(migration).not.toMatch(/c\.deleted_at\s+IS\s+NULL/);
    expect(migration).toContain('where c.id = v_catalog_id');
    expect(migration).toContain("(c.active or c.deleted_at is null");
  });

  it('never uses source UUID as catalog.id or rate_versions.rate_id', () => {
    const badPatterns = [
      "c.id = 'b05f7d96",
      "c.id = '4ac78458",
      "c.id = '7de2c892",
      "c.id = 'd54e03d2",
      "rate_id = 'b05f7d96",
      "rate_id = '4ac78458",
      "rate_id = '7de2c892",
      "rate_id = 'd54e03d2",
      "concept_id = 'b05f7d96",
      "concept_id = '4ac78458",
      "concept_id = '7de2c892",
      "concept_id = 'd54e03d2",
    ];
    for (const pattern of badPatterns) {
      expect(migration).not.toContain(pattern);
    }
  });

  it('preflights the four exact source rates and legacy references', () => {
    for (const value of [
      "('Técnico', 22, 110, '2026-08-14', null)",
      "('Desplazamiento', 35, 55, '2026-08-14', null)",
      "('Grúa', 38, 95, '2026-08-20', null)",
      "('Plataforma elevadora PEMP', 38, 250, '2026-08-20', null)",
    ]) expect(migration).toContain(value);
    expect(migration).toContain('fuente legacy incompatible o ambigua');
    expect(migration).toContain('tiene referencias operativas');
    expect(migration).toContain('version legacy de Técnico incompatible o ambigua');
  });

  it('creates the canonical concepts and versions with the confirmed economics', () => {
    for (const value of [
      "('tecnico', 'Técnico', 'labor', 'labor', 'h', 'hour', null)",
      "('desplazamiento', 'Desplazamiento', 'cost', 'cost', 'ud', 'unit', null)",
      "('grua', 'Grua', 'cost', 'cost', 'ud', 'unit', null)",
      "('pemp', 'PEMP', 'cost', 'cost', 'period', 'period', 3)",
      "('tecnico', 22, 110, '2026-08-14')",
      "('desplazamiento', 35, 55, '2026-08-14')",
      "('grua', 38, 95, '2026-08-20')",
      "('pemp', 38, 250, '2026-08-20')",
    ]) expect(migration).toContain(value);
    expect(migration).toContain('period_days = 3');
    expect(migration).toContain('No se calcula automaticamente desde fechas');
    expect(migration).toContain('contributes_to_sale, active, created_by, updated_by');
    expect(migration).not.toMatch(/set\s+contributes_to_sale\s*=\s*true/i);
  });

  it('archives legacy concepts and versions without DELETE', () => {
    expect(migration).toContain('Archivado por 061');
    expect(migration).toContain('Archivada por 061');
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });

  it('never reconstructs operational history or economic snapshots', () => {
    expect(migration).not.toMatch(/update\s+public\.work_order_time_entries/i);
    expect(migration).not.toMatch(/update\s+public\.work_order_cost_entries/i);
    expect(migration).not.toMatch(/update\s+public\.quote_lines/i);
    expect(migration).toContain('dmp_061_cost_baseline');
    expect(migration).toContain('dmp_061_time_baseline');
    expect(migration).not.toMatch(/v_total_cost\s*<>\s*875|v_total_price\s*<>\s*0/);
    expect(migration).not.toMatch(/baseline economico inesperado/i);
    expect(migration.indexOf('create temp table dmp_061_cost_baseline')).toBeLessThan(migration.indexOf('update public.rate_catalog'));
    expect(migration.indexOf('create temp table dmp_061_time_baseline')).toBeLessThan(migration.indexOf('update public.rate_catalog'));
    expect(migration).toContain('cambiaron los snapshots economicos de work_order_cost_entries');
    expect(migration).toContain('cambiaron los snapshots economicos de work_order_time_entries');
    expect(migration).toContain('except');
    expect(migration).toContain('raise exception');
    expect(migration).toContain('rate_id = v_catalog_id');
    expect(migration).toContain('rate_version_id');
    expect(migration).not.toContain('set rate_id');
    expect(migration).not.toContain('set rate_version_id');
  });

  it('is idempotent and aborts on incompatible active overlaps', () => {
    expect(migration).toContain('on conflict (company_id, code) do nothing');
    expect(migration).toContain('Version canonica operativa creada por 061');
    expect(migration).toContain('version activa solapada e incompatible');
    expect(migration).toContain('rate_versions v');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("daterange(v.valid_from, coalesce(v.valid_to, '9999-12-31'::date), '[]')");
  });
});