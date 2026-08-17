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

  it('keeps profile id, auth user id, email, active state and superadmin permissions', () => {
    expect(migration).toContain('where id = v_superadmin_profile_id');
    expect(migration).toContain('auth_user_id = v_superadmin_auth_user_id');
    expect(migration).toContain('lower(v_profile.email) is distinct from v_superadmin_email');
    expect(migration).toContain('v_profile.active is not true or v_profile.deleted_at is not null');
    expect(migration).toContain("v_profile.primary_area = 'superadmin'");
    expect(migration).toContain("r.name = 'superadmin'");
    expect(migration).not.toMatch(/set\s+id\s*=/i);
    expect(migration).not.toMatch(/set\s+auth_user_id\s*=/i);
    expect(migration).not.toMatch(/set\s+email\s*=/i);
  });

  it('runs preconditions before updates', () => {
    const firstUpdate = migration.search(/update\s+public\./i);
    expect(firstUpdate).toBeGreaterThan(0);
    expect(migration.indexOf('La empresa operadora destino no existe')).toBeGreaterThan(0);
    expect(migration.indexOf('La empresa secundaria esperada no existe')).toBeGreaterThan(0);
    expect(migration.indexOf('No existe exactamente el perfil superadmin esperado')).toBeGreaterThan(0);
    expect(migration.indexOf('El auth_user_id del perfil superadmin no coincide')).toBeGreaterThan(0);
    expect(migration.indexOf('foreach v_table in array v_company_tables loop')).toBeLessThan(firstUpdate);
    expect(migration.indexOf('Ya existe otro perfil con el email superadmin')).toBeLessThan(firstUpdate);
  });

  it('checks operational and economic tables before consolidating', () => {
    const expectedTables = [
      'clients',
      'sites',
      'equipment',
      'quotes',
      'quote_lines',
      'work_orders',
      'checks',
      'materials',
      'stock_movements',
      'material_stock_movements',
      'technician_hour_rates',
      'work_order_time_entries',
      'work_order_cost_entries',
      'work_order_assignments',
      'activity_log',
      'audit_log',
    ];

    for (const table of expectedTables) {
      expect(migration).toContain(`'${table}'`);
    }
  });

  it('only moves the superadmin profile and inactivates the secondary company', () => {
    expect(migration).toMatch(/update\s+public\.profiles\s+set\s+company_id\s*=\s*v_target_company_id/is);
    expect(migration).toMatch(/where\s+id\s*=\s*v_superadmin_profile_id\s+and\s+auth_user_id\s*=\s*v_superadmin_auth_user_id\s+and\s+company_id\s*=\s*v_secondary_company_id/is);
    expect(migration).toMatch(/update\s+public\.companies\s+set\s+active\s*=\s*false,\s+deleted_at\s*=\s*null/is);
    expect(migration).toContain('public.dmp_operating_company_id() is distinct from v_target_company_id');
  });

  it('does not delete records, disable RLS, use service role or reassign operational data', () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.companies/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
    expect(migration).not.toContain('service_role');
    expect(migration).not.toMatch(/disable\s+row\s+level\s+security/i);
    expect(migration).not.toMatch(/update\s+public\.(clients|sites|equipment|quotes|quote_lines|work_orders|checks|materials|stock_movements|material_stock_movements|technician_hour_rates|work_order_time_entries|work_order_cost_entries|work_order_assignments)\s+set\s+company_id/is);
  });
});
