import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/012_rls_critical_policy_cleanup.sql'), 'utf8');
const auditMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/019_audit_functional_stabilization.sql'), 'utf8');

describe('RLS critical migration', () => {
  it('elimina policies genericas criticas por nombre', () => {
    for (const policy of [
      'check_templates_company_policy',
      'check_photos_company_policy',
      'cases_company_policy',
      'alerts_company_policy',
      'stock_movements_company_policy',
      'material_requests_company_policy',
      'quote_lines_company_policy',
      'check_template_sections_authenticated',
      'check_template_items_authenticated',
      'alerts_select_company',
      'alerts_write_roles',
      'alerts_update_roles',
    ]) {
      expect(migration).toContain(policy);
    }
  });

  it('no crea policies FOR ALL nuevas', () => {
    expect(migration.toLowerCase()).not.toContain(' for all to authenticated');
  });
});

describe('functional audit migration', () => {
  it('normaliza SAT y Comercial de forma determinista y segura ante NULL', () => {
    expect(auditMigration).toContain('create or replace function public.normalize_profile_role_names');
    expect(auditMigration).toContain('coalesce(p_role_names, array[]::text[])');
    expect(auditMigration).toContain('array_agg(name order by ord)');
    expect(auditMigration).toContain("name = 'Comercial' and exists (select 1 from cleaned where name = 'SAT')");
    expect(auditMigration).toContain("p.primary_area is distinct from 'SAT'");
  });

  it('endurece avisos validando el perfil autenticado', () => {
    expect(auditMigration).toContain('p_profile_id is distinct from v_current_profile');
    expect(auditMigration).toContain('drop policy if exists alert_recipients_update_scoped');
    expect(auditMigration).toContain('recipient_profile_id = public.current_profile_id()');
  });
});
