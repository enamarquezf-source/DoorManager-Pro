import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/051_consolidate_operating_company.sql', import.meta.url), 'utf8');

const targetCompanyId = '00000000-0000-0000-0000-000000000001';
const secondaryCompanyId = 'fd3528fa-7603-4bb6-9e45-5dcb1f80c664';
const superadminProfileId = '3e8504b5-79da-429d-a985-0269425d2bc7';
const superadminAuthUserId = '1a7b729f-b01e-4161-b9c1-8006d6eb6852';

describe('051 operating company consolidation', () => {
  it('parses as SQL and is transactional', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(migration).toMatch(/begin;[\s\S]*commit;\s*$/i);
  });

  it('targets the real production company and superadmin records', () => {
    expect(migration).toContain(targetCompanyId);
    expect(migration).toContain(secondaryCompanyId);
    expect(migration).toContain(superadminProfileId);
    expect(migration).toContain(superadminAuthUserId);
    expect(migration).toContain('fonsy69@gmail.com');
  });

  it('audits every table with company_id dynamically, not a static stale list', () => {
    expect(migration).toContain('information_schema.columns');
    expect(migration).toContain("column_name = 'company_id'");
    expect(migration).toContain("table_type = 'BASE TABLE'");
    expect(migration).toContain("c.table_name not in ('profiles', 'work_order_notes')");
    expect(migration).toContain("c.table_name <> 'companies'");
    expect(migration).not.toMatch(/v_company_tables\s+text\[\]\s*:=?\s*array\[/i);
  });

  it('requires preconditions (RAISE EXCEPTION) before any update', () => {
    const firstUpdate = migration.search(/update\s+public\./i);
    expect(firstUpdate).toBeGreaterThan(0);
    expect(migration.indexOf('La empresa operadora destino no existe')).toBeGreaterThan(0);
    expect(migration.indexOf('La empresa secundaria esperada no existe')).toBeGreaterThan(0);
    expect(migration.indexOf('No existe exactamente el perfil superadmin esperado')).toBeGreaterThan(0);
    expect(migration.indexOf('El auth_user_id del perfil superadmin no coincide')).toBeGreaterThan(0);
    expect(migration.indexOf('Ya existe otro perfil con el email superadmin')).toBeGreaterThan(0);
    expect(migration.indexOf('La empresa secundaria contiene datos no reconciliables en %')).toBeLessThan(firstUpdate);
    expect(migration.indexOf('Existen notas de la empresa secundaria cuyo parte padre no pertenece')).toBeLessThan(firstUpdate);
  });

  it('corrects work_order_notes through the work_orders parent, not blindly', () => {
    expect(migration).toContain('update public.work_order_notes n');
    expect(migration).toContain('set company_id = w.company_id');
    expect(migration).toContain('from public.work_orders w');
    expect(migration).toContain('w.id = n.work_order_id');
    expect(migration).toContain('w.company_id = v_target_company_id');
    expect(migration).toContain('n.company_id = v_secondary_company_id');
    expect(migration).toContain('Existen notas de la empresa secundaria cuyo parte padre no pertenece a la empresa operadora destino');
  });

  it('does not modify the note content or any note field other than company_id', () => {
    expect(migration).not.toMatch(/set\s+note\s*=/i);
    expect(migration).not.toMatch(/set\s+visibility\s*=/i);
    expect(migration).not.toMatch(/set\s+created_by\s*=/i);
    expect(migration).not.toMatch(/set\s+created_at\s*=/i);
    expect(migration).not.toMatch(/set\s+local_change_id\s*=/i);
    expect(migration).not.toMatch(/set\s+id\s*=/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.work_order_notes/i);
  });

  it('protects against local_change_id collisions when moving notes', () => {
    expect(migration).toContain('Conflicto de local_change_id al corregir notas de la empresa secundaria');
  });

  it('only moves the superadmin profile and only its company_id', () => {
    expect(migration).toMatch(/update\s+public\.profiles\s+set\s+company_id\s*=\s*v_target_company_id/is);
    expect(migration).toMatch(/where\s+id\s*=\s*v_superadmin_profile_id\s+and\s+auth_user_id\s*=\s*v_superadmin_auth_user_id\s+and\s+company_id\s*=\s*v_secondary_company_id/is);
    expect(migration).not.toMatch(/set\s+id\s*=/i);
    expect(migration).not.toMatch(/set\s+auth_user_id\s*=/i);
    expect(migration).not.toMatch(/set\s+email\s*=/i);
    expect(migration).not.toMatch(/set\s+first_name\s*=/i);
    expect(migration).not.toMatch(/set\s+last_name\s*=/i);
    expect(migration).not.toMatch(/set\s+primary_area\s*=/i);
    expect(migration).not.toMatch(/set\s+hired_at\s*=/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
  });

  it('keeps profile id, auth user id, email, active state and superadmin permissions', () => {
    expect(migration).toContain('where id = v_superadmin_profile_id');
    expect(migration).toContain('auth_user_id = v_superadmin_auth_user_id');
    expect(migration).toContain('lower(v_profile.email) is distinct from v_superadmin_email');
    expect(migration).toContain('v_profile.active is not true or v_profile.deleted_at is not null');
    expect(migration).toContain("v_profile.primary_area = 'superadmin'");
    expect(migration).toContain("r.name = 'superadmin'");
  });

  it('inactivates the secondary company without delete or deleted_at', () => {
    expect(migration).toMatch(/update\s+public\.companies\s+set\s+active\s*=\s*false,\s+updated_at\s*=\s*now\(\)/is);
    expect(migration).toMatch(/where\s+id\s*=\s*v_secondary_company_id/is);
    expect(migration).not.toMatch(/delete\s+from\s+public\.companies/i);
    expect(migration).not.toMatch(/set\s+active\s*=\s*false,\s+deleted_at/is);
  });

  it('leaves the operating company active and never updates it', () => {
    expect(migration).toContain('La empresa operadora destino no permanece activa');
    expect(migration).toContain('La empresa secundaria no quedo inactiva');
    expect(migration).not.toMatch(/update\s+public\.companies\s+set[\s\S]*where\s+id\s*=\s*v_target_company_id/i);
  });

  it('verifies the final consolidated state inside the transaction', () => {
    expect(migration).toContain('public.dmp_operating_company_id() is distinct from v_target_company_id');
    expect(migration).toContain('El perfil superadmin no quedo asociado correctamente a la empresa operadora');
    expect(migration).toContain('Aun existen datos con company_id secundaria en %');
  });

  it('covers all operational and economic child tables through the dynamic company_id audit', () => {
    expect(migration).toContain('information_schema.columns');
    expect(migration).toContain("column_name = 'company_id'");
    expect(migration).toContain("c.table_name not in ('profiles', 'work_order_notes')");
    expect(migration).toContain('La empresa secundaria contiene datos no reconciliables en %. No se reasigna automaticamente.');
  });

  it('never reassigns company_id on operational or economic child tables', () => {
    const protectedTables = [
      'clients',
      'client_contacts',
      'access_requirements',
      'sites',
      'site_contacts',
      'equipment_types',
      'equipment',
      'equipment_components',
      'equipment_status_history',
      'files',
      'equipment_photos',
      'cases',
      'case_events',
      'case_links',
      'case_documents',
      'work_orders',
      'work_order_equipment',
      'work_order_assignments',
      'work_order_status_history',
      'work_order_photos',
      'work_order_signatures',
      'work_order_time_entries',
      'work_order_cost_entries',
      'work_order_planned_material_decisions',
      'work_order_quote_line_decisions',
      'check_templates',
      'checks',
      'check_section_results',
      'check_item_results',
      'check_photos',
      'deficiencies',
      'corrective_actions',
      'alerts',
      'alert_recipients',
      'documents',
      'document_links',
      'suppliers',
      'materials',
      'warehouses',
      'warehouse_stock',
      'stock_movements',
      'material_stock_movements',
      'material_requests',
      'work_order_materials',
      'opportunities',
      'quotes',
      'quote_lines',
      'technician_hour_rates',
      'storage_cleanup_queue',
      'activity_log',
      'audit_log',
    ];
    for (const table of protectedTables) {
      expect(migration).not.toMatch(new RegExp(`update\\s+public\\.${table}\\s+set\\s+company_id`, 'i'));
    }
  });

  it('does not delete records, disable RLS, use service role or reassign operational data', () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.companies/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
    expect(migration).not.toContain('service_role');
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(migration).not.toMatch(/update\s+public\.(clients|sites|equipment|quotes|quote_lines|work_orders|checks|materials|stock_movements|material_stock_movements|technician_hour_rates|work_order_time_entries|work_order_cost_entries|work_order_assignments|work_order_equipment|work_order_materials|warehouses|warehouse_stock|material_requests|suppliers|files|documents)\s+set\s+company_id/is);
  });

  it('requires the secondary company to hold only the expected superadmin profile', () => {
    expect(migration).toContain('La empresa secundaria debe contener solo el perfil superadmin esperado');
  });
});