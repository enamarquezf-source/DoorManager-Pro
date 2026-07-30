import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const managementService = readFileSync(new URL('../services/managementService.ts', import.meta.url), 'utf8');
const permissionMigration = readFileSync(new URL('../../supabase/migrations/016_align_management_permissions.sql', import.meta.url), 'utf8');

describe('management navigation', () => {
  it('routes management KPIs to their source lists', () => {
    expect(app).toContain("'/app/modulos/presupuestos?estado=aceptado'");
    expect(app).toContain("'/app/modulos/oportunidades'");
    expect(app).toContain('workOrderFilterFromParams');
    expect(app).toContain('deficiencyFiltersFromParams');
  });

  it('uses real sales tables for management sales pages', () => {
    expect(app).toContain('function SalesModule');
    expect(managementService).toContain("supabase.from('opportunities')");
    expect(managementService).toContain("supabase.from('quotes')");
  });

  it('does not send unrelated alerts to deficiencies by default', () => {
    expect(app).toContain("item.related_entity ? routeForAlert(item) : item.code ? `/app/deficiencias/${item.id}` : '/app/avisos'");
    expect(app).toContain("if (!alert?.related_entity || !alert?.related_id) return '/app/avisos'");
  });

  it('aligns management RLS with the documented least-privilege matrix', () => {
    expect(permissionMigration).toContain('Gerencia mantiene vision global');
    expect(permissionMigration).toContain("array['superadmin','SAT','Comercial']");
    expect(permissionMigration).toContain("array['superadmin','SAT']");
    expect(permissionMigration).not.toContain("checks_insert_operational on public.checks for insert to authenticated\n  with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Gerencia'])");
  });
});
