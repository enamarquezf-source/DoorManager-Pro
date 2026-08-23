import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/066_harden_rate_version_management.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/hourRatesService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const versionForm = app.slice(app.indexOf("} else { await hourRatesService.createVersion"), app.indexOf("} onSaved();", app.indexOf("} else { await hourRatesService.createVersion")));
const managementModule = app.slice(app.indexOf('function RateCatalogModuleV2'), app.indexOf('function ManagementPage060'));
const rateForm = app.slice(app.indexOf('function RateCatalogForm'), app.indexOf('function RateCatalogModuleV2'));

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
    expect(app).toContain('Nueva version');
  });

  it('does not update economic snapshots', () => {
    expect(migration).not.toContain('work_order_time_entries set');
    expect(migration).not.toContain('work_order_cost_entries set');
  });

  it('separates version creation from concept editing in the active UI', () => {
    expect(managementModule).toContain("formMode: 'version'");
    expect(managementModule).toContain('Editar concepto');
    expect(versionForm).toContain('hourRatesService.createVersion');
    expect(versionForm).not.toContain('updateCatalog');
    expect(rateForm).toContain('readOnly');
    expect(app).toContain('Error al crear la nueva versión de tarifa.');
    expect(app).toContain('Error al editar el concepto.');
  });
});
