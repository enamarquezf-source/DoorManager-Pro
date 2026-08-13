import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/041_quote_permissions_lifecycle.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const lifecycleService = readFileSync(new URL('../services/entityLifecycleService.ts', import.meta.url), 'utf8');

describe('quote permissions lifecycle 041', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('allows authorized roles to create edit and archive quotes by company', () => {
    for (const role of ['superadmin', 'SAT', 'Comercial', 'Gerencia', 'Oficina']) {
      expect(migration).toContain(role);
      expect(permissions).toContain(role);
    }
    expect(migration).toContain('quotes_insert_authorized_roles');
    expect(migration).toContain('quotes_update_authorized_roles');
    expect(migration).toContain('company_id = public.current_company_id()');
    expect(migration).toContain("using (company_id = public.current_company_id() and public.has_any_role(array['superadmin','Comercial','Gerencia','SAT','Oficina']))");
    expect(migration).not.toContain('disable row level security');
    expect(migration).not.toContain('service_role');
  });

  it('preserves the current quote client option when editing', () => {
    expect(app).toContain('const clientOptions = clients.data.map');
    expect(app).toContain('!clientOptions.some');
    expect(app).toContain('Cliente asociado actualmente');
    expect(app).toContain('value={values.client_id}');
  });

  it('supports quote archive audit without physical delete', () => {
    expect(migration).toContain('alter table public.quotes add column if not exists deleted_by');
    expect(migration).toContain('alter table public.quotes add column if not exists delete_reason');
    expect(migration).toContain('quote_lines add column if not exists deleted_by');
    expect(migration).toContain('dmp_archive_quote');
    expect(migration).toContain('dmp_record_lifecycle_audit');
    expect(migration).toContain('quotes_no_physical_delete');
    expect(migration).toContain('quote_lines_no_physical_delete');
    expect(migration).toContain("operation', 'archived'");
  });

  it('wires quote lifecycle and archive filters in the frontend', () => {
    expect(lifecycleService).toContain("'quotes'");
    expect(lifecycleService).toContain("quotes: 'presupuesto'");
    expect(quotesService).toContain('applyArchiveFilter');
    expect(quotesService).toContain('archiveFilter: ArchiveFilter = \'active\'');
    expect(app).toContain("LifecycleActionPanel entity=\"quotes\"");
    expect(app).toContain("isArchivedRecord('quotes', quote)");
    expect(app).toContain('quoteArchiveOnly');
    expect(app).toContain('skipDependencyLoad={quoteArchiveOnly}');
  });
});
