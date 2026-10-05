import { describe, expect, it } from 'vitest';
import { detailBackRoute } from './detailBackRoute';

describe('direct detail return destination', () => {
  it('returns to the appropriate operational list', () => {
    expect(detailBackRoute('/app/equipos/equipment-id')).toBe('/app/equipos');
    expect(detailBackRoute('/app/modulos/presupuestos/quote-id')).toBe('/app/modulos/presupuestos');
    expect(detailBackRoute('/app/superadmin/equipos/equipment-id')).toBe('/app/superadmin/equipos');
  });
  it('uses Inicio when there is no parent list', () => {
    expect(detailBackRoute('/app/modulos/compras')).toBe('/app/inicio');
    expect(detailBackRoute('/app/partes')).toBe('/app/inicio');
  });
  it('returns technician details to Mi jornada and query details to their list', () => {
    expect(detailBackRoute('/app/tecnico/trabajo/work-id')).toBe('/app/tecnico');
    expect(detailBackRoute('/app/modulos/compras', '?pedido=order-id')).toBe('/app/modulos/compras');
  });
});
