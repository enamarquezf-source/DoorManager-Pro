import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/033_fix_equipment_components.sql', import.meta.url), 'utf8');
const equipmentService = readFileSync(new URL('../services/equipmentService.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');

describe('equipment components and quotes 033', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('fixes component creation without opening broad write access', () => {
    expect(migration).toContain('alter table public.equipment_components drop constraint if exists equipment_components_component_type_check');
    expect(migration).toContain('equipment_components_insert_operational');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain('e.company_id = equipment_components.company_id');
    expect(migration).toContain('public.is_assigned_to_work_order');
    expect(migration).not.toContain('service_role');
    expect(migration.toLowerCase()).not.toContain('disable row level security');
  });

  it('uses real permission helpers available in this project', () => {
    expect(migration).not.toContain('is_superadmin()');
    expect(migration).toContain('public.has_any_role');
    expect(migration).toContain("public.has_any_role(array['superadmin']");
    expect(migration).toContain('public.current_company_id()');
    expect(migration).toContain('public.current_profile_id()');
    expect(migration).toContain('public.is_assigned_to_work_order');
  });

  it('keeps component payload safe and logs Supabase diagnostics', () => {
    expect(equipmentService).toContain('componentColumns');
    expect(equipmentService).toContain('componentPayload');
    expect(equipmentService).toContain('DMP equipment component save failed');
    expect(equipmentService).toContain('message: error?.message');
    expect(equipmentService).toContain('details: error?.details');
    expect(equipmentService).toContain('hint: error?.hint');
    expect(equipmentService).toContain('code: error?.code');
    expect(equipmentService).not.toContain('code, componentColumns');
  });

  it('extends existing quotes instead of duplicating budget tables', () => {
    expect(migration).toContain('alter table public.quotes add column if not exists quote_type');
    expect(migration).toContain('alter table public.quote_lines add column if not exists line_type');
    expect(migration).toContain('subtotal_cost');
    expect(migration).toContain('estimated_margin');
    expect(migration).toContain("quote_type in ('instalacion','reparacion','mantenimiento')");
    expect(migration).toContain("line_type in ('material','labor','transport','travel','mobile_workshop','lifting_platform','auxiliary_equipment','external_cost','fee','discount','other')");
    expect(migration).not.toContain('create table public.budgets');
    expect(migration).not.toContain('security definer');
  });

  it('connects minimal quote UI and permissions for requested roles', () => {
    expect(quotesService).toContain("supabase.from('quotes')");
    expect(quotesService).toContain("supabase.from('quote_lines')");
    expect(app).toContain('function QuotesModule');
    expect(app).toContain('QuoteLineForm');
    expect(app).toContain("['instalacion','Instalación']");
    expect(app).toContain("['labor','Horas']");
    expect(permissions).toContain("path.startsWith('/app/modulos/presupuestos')");
    expect(permissions).toContain("['superadmin', 'SAT', 'Gerencia', 'Comercial']");
  });
});
