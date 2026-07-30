import { describe, expect, it } from 'vitest';
import { canAccessRoute, isSuperadmin } from './permissions';
import type { Profile, RoleName } from '../shared/types';

function profile(primary_area: RoleName, roles: RoleName[] = []): Profile {
  return { id: `${primary_area}-id`, company_id: 'company-id', auth_user_id: `${primary_area}-auth`, first_name: primary_area, last_name: 'Test', email: `${primary_area}@test.local`, phone: null, primary_area, active: true, roles };
}

describe('canAccessRoute', () => {
  it('permite al tecnico acceder a checks y avisos', () => {
    const tecnico = profile('Tecnico');
    expect(canAccessRoute(tecnico, '/app/checks')).toBe(true);
    expect(canAccessRoute(tecnico, '/app/checks/check-1')).toBe(true);
    expect(canAccessRoute(tecnico, '/app/avisos')).toBe(true);
  });

  it('bloquea superadmin y zonas globales a tecnico puro', () => {
    const tecnico = profile('Tecnico');
    expect(canAccessRoute(tecnico, '/app/superadmin')).toBe(false);
    expect(canAccessRoute(tecnico, '/app/clientes')).toBe(false);
    expect(canAccessRoute(tecnico, '/app/partes')).toBe(false);
  });

  it('permite rutas superadmin solo a superadmin', () => {
    const owner = profile('superadmin');
    expect(isSuperadmin(owner)).toBe(true);
    expect(canAccessRoute(owner, '/app/superadmin')).toBe(true);
    expect(canAccessRoute(owner, '/app/superadmin/usuarios/nuevo')).toBe(true);
    expect(canAccessRoute(profile('SAT'), '/app/superadmin')).toBe(false);
  });
});
