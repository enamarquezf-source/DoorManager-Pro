import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/031_fix_security_definer_views.sql', import.meta.url), 'utf8');

const views = [
  'v_open_work_orders',
  'v_equipment_history',
  'v_completed_checks',
  'v_unread_alerts',
  'v_sat_dashboard',
  'v_management_metrics',
];

describe('security definer views 031', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('forces all linter-reported views to run as security invoker', () => {
    for (const view of views) {
      expect(migration).toContain(`'${view}'`);
    }

    expect(migration).toContain('alter view public.%I set (security_invoker = true)');
  });

  it('does not recreate views as security definer or bypass RLS', () => {
    expect(migration.toLowerCase()).not.toContain('security definer');
    expect(migration.toLowerCase()).not.toContain('disable row level security');
    expect(migration.toLowerCase()).not.toContain('service_role');
  });
});
