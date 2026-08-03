import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchRoutes } from 'react-router-dom';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const declaredRoutes = Array.from(app.matchAll(/<Route path="([^"]+)"/g), ([, path]) => path)
  .filter((path) => !path.includes('*'))
  .map((path) => ({ path }));

const dashboardGeneratedRoutes = [
  '/app/partes?fecha=hoy',
  '/app/partes/90ad219b-f5d0-4489-a834-eac040469be6',
  '/app/modulos/tecnicos',
  '/app/modulos/tecnicos/tech-profile-id',
  '/app/avisos',
  '/app/deficiencias/deficiency-id',
  '/app/checks/check-id',
  '/app/equipos/equipment-id',
  '/app/clientes/client-id',
  '/app/centros/site-id',
  '/app/expedientes/case-id',
];

describe('dashboard route declarations', () => {
  it('declara rutas concretas para las URLs generadas por dashboards operativos', () => {
    for (const route of dashboardGeneratedRoutes) {
      const pathname = route.split('?')[0];
      expect(matchRoutes(declaredRoutes, pathname), route).not.toBeNull();
    }
  });
});
