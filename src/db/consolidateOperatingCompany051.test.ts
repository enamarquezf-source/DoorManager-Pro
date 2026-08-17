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
    expect(migration).toContain("and c.column_name = 'company_id'");
    expect(migration).toContain("and t.table_type = 'BASE TABLE'");
    // The audit inspects every base table with company_id and only excludes the
    // entities this migration handles explicitly.
    expect(migration).toMatch(/c\.table_name\s+not\s+in\s*\(/i);
    expect(migration).toContain("'work_order_notes'");
    expect(migration).toContain("'activity_log'");
    expect(migration).toContain("'profile_roles'");
    // The final post-consolidation audit leaves in only the historical companies row.
    expect(migration).toContain("and c.table_name <> 'companies'");
    // Rows are counted per dynamic table name, never via a hardcoded table array.
    expect(migration).toContain('select count(*) from public.%I where company_id = $1');
    expect(migration).not.toMatch(/v_company_tables\s+text\[\]\s*:=?\s*array\[/i);
  });

  it('requires preconditions (RAISE EXCEPTION) before any update', () => {
    const firstUpdate = migration.search(/update\s+public\./i);
    expect(firstUpdate).toBeGreaterThan(0);
    const preconditions = migration.slice(0, firstUpdate);
    for (const message of [
      'La empresa operadora destino no existe',
      'La empresa secundaria esperada no existe',
      'No existe el perfil Superadmin esperado',
      'El auth_user_id del perfil Superadmin no coincide',
      'El email del perfil Superadmin no coincide',
      'El perfil Superadmin esperado no esta activo',
      'El perfil esperado no conserva permisos Superadmin',
      'El perfil Superadmin pertenece a una empresa inesperada',
      'Ya existe otro perfil con el email del Superadmin en la empresa operadora destino',
      'La nota conocida apunta a un parte diferente del esperado',
      'El parte relacionado con la nota no pertenece a la empresa operadora esperada',
    ]) {
      expect(preconditions).toContain(message);
    }
    // Reconciliation is still defensive: any leftover secondary note stops the migration.
    expect(migration).toContain('Quedan % work_order_notes de la empresa secundaria sin reconciliar');
  });

  it('corrects work_order_notes through the work_orders parent, not blindly', () => {
    expect(migration).toContain('update public.work_order_notes won');
    expect(migration).toContain('set company_id = wo.company_id');
    expect(migration).toContain('from public.work_orders wo');
    expect(migration).toContain('won.work_order_id = wo.id');
    expect(migration).toContain('won.company_id = v_secondary_company_id');
    expect(migration).toContain('wo.company_id = v_target_company_id');
    expect(migration).toContain('El parte relacionado con la nota no pertenece a la empresa operadora esperada');
    expect(migration).toContain("'La nota conocida apunta a un parte diferente del esperado'");
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
    // The note company_id is fixed only when the parent work order belongs to the operating company.
    expect(migration).toContain('Quedan % work_order_notes de la empresa secundaria sin reconciliar');
    expect(migration).not.toMatch(/set\s+local_change_id\s*=/i);
    expect(migration).not.toMatch(/set\s+id\s*=/i);
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
    expect(migration).toContain('lower(v_profile.email) is distinct from lower(v_superadmin_email)');
    expect(migration).toContain('v_profile.active is not true');
    expect(migration).toContain('v_profile.deleted_at is not null');
    expect(migration).toContain("lower(v_profile.primary_area) = 'superadmin'");
    expect(migration).toContain("lower(r.name) = 'superadmin'");
  });

  it('inactivates the secondary company without delete or soft-deleting it', () => {
    expect(migration).toMatch(/update\s+public\.companies\s+set\s+active\s*=\s*false,/is);
    expect(migration).toContain('deleted_at = null');
    expect(migration).toContain('updated_at = now()');
    expect(migration).toMatch(/where\s+id\s*=\s*v_secondary_company_id/is);
    expect(migration).not.toMatch(/delete\s+from\s+public\.companies/i);
    expect(migration).not.toMatch(/set\s+deleted_at\s*=\s*now\(\)/i);
    expect(migration).not.toMatch(/set\s+active\s*=\s*false,\s+deleted_at\s*=\s*now\(\)/is);
  });

  it('leaves the operating company active and never updates it', () => {
    expect(migration).toContain('Despues de consolidar debe existir exactamente una empresa activa; encontradas: %');
    expect(migration).toContain('La unica empresa activa resultante no es la empresa operadora esperada');
    expect(migration).toContain('La empresa secundaria continua activa');
    // The only companies update deactivates the secondary company; the operating one is never touched.
    const companiesUpdates = migration.match(/update\s+public\.companies\s+set[\s\S]*?;/gi) ?? [];
    expect(companiesUpdates.length).toBe(1);
    expect(companiesUpdates[0]).toContain('where id = v_secondary_company_id');
    expect(companiesUpdates[0]).not.toContain('v_target_company_id');
  });

  it('verifies the final consolidated state inside the transaction', () => {
    expect(migration).toContain('public.dmp_operating_company_id()');
    expect(migration).toContain('is distinct from v_target_company_id');
    expect(migration).toContain('El perfil Superadmin no quedo asociado correctamente a la empresa operadora');
    expect(migration).toContain('Despues de consolidar aun quedan datos vinculados a la empresa secundaria: %');
  });

  it('covers all operational and economic child tables through the dynamic company_id audit', () => {
    expect(migration).toContain('information_schema.columns');
    expect(migration).toContain("and c.column_name = 'company_id'");
    expect(migration).toContain("and t.table_type = 'BASE TABLE'");
    expect(migration).toMatch(/c\.table_name\s+not\s+in\s*\(/i);
    expect(migration).toContain("'work_order_notes'");
    expect(migration).toContain('La empresa secundaria conserva datos no reconciliados: %');
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
    expect(migration).toContain('La empresa secundaria contiene otros perfiles distintos del Superadmin esperado: %');
    expect(migration).toContain('where company_id = v_secondary_company_id');
    expect(migration).toContain('id <> v_superadmin_profile_id');
    expect(migration).toContain('Todavia quedan % perfiles asociados a la empresa secundaria');
  });
});