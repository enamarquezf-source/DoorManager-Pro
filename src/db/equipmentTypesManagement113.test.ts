import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/113_equipment_types_management.sql', import.meta.url), 'utf8');
const migration114 = readFileSync(new URL('../../supabase/migrations/114_restore_equipment_type_platform_scope.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_equipment_types_management_113.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/postflight_equipment_types_management_113.sql', import.meta.url), 'utf8');
const preflight114 = readFileSync(new URL('../../supabase/verification/preflight_restore_equipment_type_platform_scope_114.sql', import.meta.url), 'utf8');
const postflight114 = readFileSync(new URL('../../supabase/verification/postflight_restore_equipment_type_platform_scope_114.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/equipmentService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('equipment types management 113', () => {
  it('parses the migration and keeps it limited to RLS policy changes', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(migration114).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight114).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(postflight114).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(preflight + postflight).not.toMatch(/\b(insert into|update public|delete from|alter table|create table|drop table|notify)\b/i);
    expect(migration).toContain('equipment_types_select_scoped');
    expect(migration).toContain('equipment_types_insert_admin');
    expect(migration).toContain('equipment_types_update_admin');
    expect(migration).not.toMatch(/insert into public\.equipment_types|update public\.equipment_types|delete from public\.equipment_types/i);
  });

  it('allows company custom types, preserves global visibility and disables physical deletion', () => {
    expect(migration).toContain('company_id = public.current_company_id()');
    expect(migration).toContain('company_id is null');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT'])");
    expect(migration).not.toContain('for delete');
    expect(migration114).toContain('equipment_types_platform_superadmin_select');
    expect(migration114).toContain('public.is_platform_superadmin()');
    expect(migration114).not.toContain('for delete');
    expect(postflight).toContain('physical_delete_disabled');
    expect(service).toContain('async createType');
    expect(service).toContain('async updateType');
    expect(service).toContain('toggleType');
    expect(service).toContain('toLocaleLowerCase()');
    expect(service).toContain('company_id.is.null');
  });

  it('exposes the catalog, dynamic type selector and template association entry point', () => {
    expect(app).toContain('/app/modulos/tipos-equipo');
    expect(app).toContain('function EquipmentTypesPage');
    expect(app).toContain('function EquipmentTypeForm');
    expect(app).toContain('equipmentService.typesAdmin()');
    expect(app).toContain('Gestionar plantillas/checks');
    expect(app).toContain('equipment_type_id');
    expect(app).toContain('typeFilter');
  });
});
