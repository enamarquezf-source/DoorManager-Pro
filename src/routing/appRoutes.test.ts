import { describe, expect, it } from 'vitest';
import { entityRoute, homeRouteForWorkspace, matchesRouteOrChild, parseManualRoute, superadminSharedRoutes } from './appRoutes';

describe('canonical app routes', () => {
  it('resolves each workspace home without an intermediate redirect', () => {
    expect(homeRouteForWorkspace('superadmin')).toBe('/app/superadmin');
    expect(homeRouteForWorkspace('tecnico')).toBe('/app/tecnico');
    expect(homeRouteForWorkspace('sat')).toBe('/app/inicio');
    expect(homeRouteForWorkspace('gerencia')).toBe('/app/inicio');
    expect(homeRouteForWorkspace('oficina')).toBe('/app/inicio');
    expect(homeRouteForWorkspace('comercial')).toBe('/app/inicio');
  });

  it('builds entity links for the active workspace', () => {
    expect(entityRoute('superadmin', 'partes', 'work-1')).toBe('/app/superadmin/partes/work-1');
    expect(entityRoute('sat', 'partes', 'work-1')).toBe('/app/partes/work-1');
  });

  it('parses manual routes once and preserves legacy dynamic routes', () => {
    expect(parseManualRoute('/app/modulos/tecnicos/tech-1')).toEqual({ kind: 'technician-profile', id: 'tech-1' });
    expect(parseManualRoute('/app/superadmin/checks/check-1/bloque/block-1')).toEqual({ kind: 'superadmin-check-block', id: 'check-1', blockId: 'block-1' });
    expect(parseManualRoute('/app/plantillas')).toEqual({ kind: 'templates' });
    expect(parseManualRoute('/app/unknown')).toBeNull();
  });

  it('keeps the explicit Superadmin shared route allowlist', () => {
    expect(superadminSharedRoutes).toContain('/app/modulos/tesoreria');
    expect(matchesRouteOrChild('/app/modulos/materiales/abc', '/app/modulos/materiales')).toBe(true);
    expect(matchesRouteOrChild('/app/modulos/materiales-extra', '/app/modulos/materiales')).toBe(false);
  });
});
