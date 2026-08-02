import { describe, expect, it } from 'vitest';
import { canAccessRoute, canCreateAlert, canManageCheck, canRole, canViewCheck, isSuperadmin, normalizedRoleNames, profileWorkspaces } from './permissions';
import type { Profile, RoleName } from '../shared/types';

function profile(primary_area: RoleName, roles: RoleName[] = []): Profile {
  return { id: `${primary_area}-id`, company_id: 'company-id', auth_user_id: `${primary_area}-auth`, first_name: primary_area, last_name: 'Test', email: `${primary_area}@test.local`, phone: null, primary_area, active: true, roles };
}

describe('canAccessRoute', () => {
  it('normaliza SAT con Comercial a un unico workspace SAT', () => {
    const sat = profile('SAT', ['SAT', 'Comercial']);
    expect(profileWorkspaces(sat)).toEqual(['sat']);
    expect(normalizedRoleNames('SAT', ['Comercial'])).toEqual(['SAT']);
  });

  it('mantiene Comercial puro en workspace comercial', () => {
    const comercial = profile('Comercial', ['Comercial']);
    expect(profileWorkspaces(comercial)).toEqual(['comercial']);
    expect(normalizedRoleNames('Comercial', [])).toEqual(['Comercial']);
  });

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

  it('impide que el tecnico cree avisos globales', () => {
    expect(canCreateAlert(profile('Tecnico'))).toBe(false);
    expect(canCreateAlert(profile('SAT'))).toBe(true);
  });

  it('permite a SAT coordinar operativa sin acceder a superadmin', () => {
    const sat = profile('SAT');
    ['/app/inicio', '/app/clientes', '/app/centros', '/app/equipos', '/app/expedientes', '/app/partes', '/app/checks', '/app/deficiencias', '/app/documentos', '/app/avisos', '/app/plantillas'].forEach((route) => expect(canAccessRoute(sat, route)).toBe(true));
    expect(canAccessRoute(sat, '/app/superadmin')).toBe(false);
    expect(canAccessRoute(sat, '/app/superadmin/usuarios')).toBe(false);
  });

  it('mantiene la matriz de gerencia alineada con permisos operativos decididos', () => {
    expect(canRole('Gerencia', 'ver clientes')).toBe(true);
    expect(canRole('Gerencia', 'asignar técnicos')).toBe(true);
    expect(canRole('Gerencia', 'crear clientes')).toBe(false);
    expect(canRole('Gerencia', 'crear checks')).toBe(false);
    expect(canRole('Gerencia', 'ejecutar checks')).toBe(false);
  });

  it('impide edición administrativa de checks a un tecnico puro', () => {
    const tecnico = profile('Tecnico');
    expect(canManageCheck(tecnico)).toBe(false);
    expect(canManageCheck(profile('SAT'))).toBe(true);
    expect(canManageCheck(profile('superadmin'))).toBe(true);
  });

  it('limita checks de tecnico puro a asignaciones propias', () => {
    const tecnico = profile('Tecnico');
    expect(canViewCheck(tecnico, { technician_id: tecnico.id })).toBe(true);
    expect(canViewCheck(tecnico, { technician_id: 'other' })).toBe(false);
  });
});
