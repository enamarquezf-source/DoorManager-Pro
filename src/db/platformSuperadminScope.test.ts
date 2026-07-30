import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/017_platform_superadmin_global_scope.sql', import.meta.url),
  'utf8',
);

describe('platform superadmin global scope migration', () => {
  it('keeps global access exclusive to an active platform owner', () => {
    expect(migration).toContain('create or replace function public.is_platform_superadmin()');
    expect(migration).toContain("r.name = 'superadmin'");
    expect(migration).toContain('p.active = true');
    expect(migration).toContain('p.deleted_at is null');
  });

  it('supports global overview and cross-company profile management', () => {
    expect(migration).toContain('superadmin_global_overview');
    expect(migration).toContain('superadmin_save_profile_with_roles');
    expect(migration).toContain('superadmin_update_profile');
    expect(migration).toContain('superadmin_set_profile_roles');
    expect(migration).toContain('public.is_platform_superadmin()');
  });

  it('does not add global physical delete policies to company data', () => {
    expect(migration).not.toContain("table_name || '_platform_superadmin_delete'");
  });
});
