import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/066_harden_rate_version_management.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/hourRatesService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('066 rate version management', () => {
  it('parses the migration', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('versions atomically and protects canonical operational concepts', () => {
    expect(migration).toContain('dmp_create_rate_version');
    expect(migration).toContain('valid_to=v_from-1');
    expect(migration).toContain('el cambio dejaria un hueco sin tarifa aplicable');
    expect(migration).toContain('dmp_rate_version_lifecycle_guard');
    expect(migration).toContain("('tecnico','desplazamiento','grua','pemp')");
    expect(migration).toContain('dmp_archive_rate_version');
    expect(migration).toContain('dmp_create_rate_catalog');
    expect(migration).toContain('dmp_update_rate_catalog');
    expect(migration).toContain('dmp_archive_rate_catalog');
    expect(migration).toContain('daterange(v.valid_from');
    expect(migration).toContain('current_company_id()');
  });

  it('routes management writes through backend RPCs', () => {
    expect(service).toContain("supabase.rpc('dmp_create_rate_catalog'");
    expect(service).toContain("supabase.rpc('dmp_update_rate_catalog'");
    expect(service).toContain("supabase.rpc('dmp_archive_rate_catalog'");
    expect(service).toContain("supabase.rpc('dmp_create_rate_version'");
    expect(service).toContain("supabase.rpc('dmp_archive_rate_version'");
    expect(service).not.toContain("supabase.from('rate_versions').insert");
    expect(service).not.toContain("supabase.from('rate_versions').update");
    expect(service).not.toContain("supabase.from('rate_catalog').update");
    expect(app).toContain('Nueva version de tarifa');
  });

  it('does not update economic snapshots', () => {
    expect(migration).not.toContain('work_order_time_entries set');
    expect(migration).not.toContain('work_order_cost_entries set');
  });
});
