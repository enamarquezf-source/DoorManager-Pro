import { describe, expect, it } from 'vitest';
import { canonicalSidebar, canonicalModulePath } from './sidebarRoutes';

describe('sidebar destinations', () => {
  it('merges historical menu names by their real destination', () => {
    const items = ['contratos', 'mantenimientos', 'personal', 'tecnicos', 'informes', 'resumen', 'informes-comerciales', 'ventas'].map(id => ({ id, label: id, path: id === 'resumen' ? '/app/gerencia' : `/app/modulos/${id}` }));
    expect(canonicalSidebar(items).map(item => item.path)).toEqual([
      '/app/modulos/mantenimientos', '/app/modulos/tecnicos', '/app/gerencia', '/app/modulos/ventas',
    ]);
  });
  it('uses names that match the destination rather than unrelated modules', () => {
    expect(canonicalSidebar([{ id: 'calidad', label: 'Calidad', path: '/app/deficiencias' }, { id: 'administracion', label: 'Administración', path: '/app/modulos/administracion' }]).map(item => [item.id, item.label])).toEqual([
      ['deficiencias', 'Deficiencias'], ['administracion', 'Datos de empresa'],
    ]);
    expect(canonicalModulePath('informes-comerciales')).toBe('/app/modulos/ventas');
  });
});
