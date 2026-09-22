import { describe, expect, it } from 'vitest';
import { canAccessModule, canAccessRoute, hasPermission } from './permissions';
import { moduleVisible } from './rbac';
import type { Profile, RoleName, Workspace } from '../shared/types';

function profile(role: RoleName, overrides: Partial<Profile> = {}): Profile {
  return {
    id: `${role}-id`, company_id: 'company-a', auth_user_id: `${role}-auth`, first_name: role,
    last_name: 'Test', email: `${role}@test.local`, phone: null, primary_area: role,
    active: true, roles: [role], ...overrides,
  };
}

describe('treasury frontend visibility regression', () => {
  it('keeps an absent visibility override visible and honors explicit false', () => {
    expect(moduleVisible(profile('Oficina', { visible_modules: [] }), 'treasury')).toBe(true);
    expect(moduleVisible(profile('Oficina', { hidden_modules: ['treasury'] }), 'treasury')).toBe(false);
  });

  it('requires treasury.read for module and route access', () => {
    const roles: Array<[RoleName, Workspace, boolean]> = [
      ['superadmin', 'superadmin', true],
      ['Gerencia', 'gerencia', true],
      ['Oficina', 'oficina', true],
      ['SAT', 'sat', false],
      ['Comercial', 'comercial', false],
      ['Tecnico', 'tecnico', false],
    ];
    for (const [role, workspace, expected] of roles) {
      const current = profile(role);
      expect(hasPermission(current, 'treasury.read')).toBe(expected);
      expect(canAccessModule(current, workspace, 'tesoreria')).toBe(expected);
      expect(canAccessRoute(current, '/app/modulos/tesoreria')).toBe(expected);
    }
  });

  it('keeps tenant superadmin access independent from platform scope and primary_area', () => {
    const tenantSuperadmin = profile('superadmin', { primary_area: 'superadmin', visible_modules: [] });
    expect(canAccessModule(tenantSuperadmin, 'superadmin', 'tesoreria')).toBe(true);
    expect(canAccessRoute(tenantSuperadmin, '/app/modulos/tesoreria')).toBe(true);
  });
});
