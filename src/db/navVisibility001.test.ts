import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const rbac = readFileSync(new URL('../auth/rbac.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/accessService.ts', import.meta.url), 'utf8');

describe('NAV-VISIBILITY-001', () => {
  it('centraliza items y no confunde visibilidad con permiso', () => {
    expect(app).toContain('navForWorkspace');
    expect(app).toContain('canAccessModule(profile, workspace, item.id)');
    expect(rbac).toContain('moduleVisible');
    expect(rbac).toContain('hasPermission');
  });

  it('protege rutas sensibles además del sidebar', () => {
    expect(app).toContain('canAccessRoute(profile, location.pathname)');
    expect(app).toContain('No tienes permiso para acceder a esta zona');
    expect(permissions).toContain("'/app/modulos/compras'");
    expect(permissions).toContain("'purchase_orders.read'");
  });

  it('expone configuración de menú por usuario mediante RPC', () => {
    expect(app).toContain('UserAccessPanel');
    expect(app).toContain('Usuarios y permisos');
    expect(app).toContain('Gestionar permisos');
    expect(service).toContain('dmp_admin_update_user_access');
    expect(service).toContain('p_module_visibility');
  });
});
