import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/012_rls_critical_policy_cleanup.sql'), 'utf8');

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
