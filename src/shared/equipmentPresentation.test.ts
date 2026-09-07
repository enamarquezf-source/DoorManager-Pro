import { describe, expect, it } from 'vitest';
import { equipmentOperationalLabel } from './equipmentPresentation';

describe('equipment operational presentation', () => {
  it('prioriza la ubicación y mantiene tipo, código, contexto y detalle', () => {
    const label = equipmentOperationalLabel({
      internal_location: 'Muelle 4 · Zona expediciones',
      code: 'EQ-ABR-000010',
      equipment_types: { name: 'Abrigo de muelle' },
      clients: { legal_name: 'Troks Iberica' },
      sites: { name: 'Troks La Cartuja' },
      brand: 'Inkema',
      model: 'Retráctil',
      status: 'Operativo',
    });

    expect(label.primary).toBe('Muelle 4 · Zona expediciones');
    expect(label.secondary).toBe('Abrigo de muelle · EQ-ABR-000010');
    expect(label.context).toBe('Troks Iberica · Troks La Cartuja');
    expect(label.detail).toBe('Inkema Retráctil');
    expect(label.status).toBe('Operativo');
    expect(`${label.primary} ${label.secondary}`).toContain('Muelle 4');
    expect(`${label.primary} ${label.secondary}`).toContain('EQ-ABR-000010');
  });

  it('expone un fallback visible para ubicaciones nulas, vacías o con espacios', () => {
    for (const value of [null, '', '   ']) {
      expect(equipmentOperationalLabel({ internal_location: value, code: 'EQ-1' }).primary).toBe('Ubicación sin definir');
    }
  });
});
