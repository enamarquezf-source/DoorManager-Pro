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

  it('archives legacy concepts and the known legacy labor version without DELETE', () => {
    for (const id of [
      'b05f7d96-e166-403a-8aea-432ef7ef764e',
      '4ac78458-45e3-4088-8a57-8dec8127c4cc',
      '7de2c892-ecf4-41af-a77d-200bef3e3bd8',
      'd54e03d2-b18f-48d6-aae8-ba52f88fc7f2',
    ]) expect(migration).toContain(id);
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
    expect(migration).toContain('rate_id = e.id');
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
    expect(migration).toContain('daterange(v.valid_from, coalesce(v.valid_to, \'9999-12-31\'::date), \'[]\')');
  });
});
