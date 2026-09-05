import { describe, expect, it } from 'vitest';
import { quoteEquipmentSelection } from './quoteEquipment';

describe('quote equipment mapping', () => {
  it('expands the four equipment lines to the expected 31 physical units', () => {
    const result = quoteEquipmentSelection([
      { description: 'Mantenimiento persiana grandes dimensiones', quantity: 15 },
      { description: 'Mantenimiento puerta seccional industrial', quantity: 3 },
      { description: 'Mantenimiento puerta rapida', quantity: 11 },
      { description: 'Mantenimiento corredera cristal', quantity: 2 },
      { description: 'Desplazamiento', quantity: 1 },
      { description: 'PEMP', quantity: 1 },
    ], [
      { id: 'persiana', name: 'Persiana' },
      { id: 'seccional', name: 'Puerta seccional industrial' },
      { id: 'rapida', name: 'Puerta rapida' },
      { id: 'peatonal', name: 'Puerta automatica peatonal' },
    ]);

    expect(result.unresolved).toEqual([]);
    expect(result.selection).toHaveLength(31);
    expect(result.selection.filter((item) => item.equipment_type_id === 'persiana')).toHaveLength(15);
    expect(result.selection.filter((item) => item.equipment_type_id === 'seccional')).toHaveLength(3);
    expect(result.selection.filter((item) => item.equipment_type_id === 'rapida')).toHaveLength(11);
    expect(result.selection.filter((item) => item.equipment_type_id === 'peatonal')).toHaveLength(2);
  });

  it('reports a recognized family when its active equipment type is missing', () => {
    const result = quoteEquipmentSelection([{ description: 'Mantenimiento persiana grandes dimensiones', quantity: 15 }], []);
    expect(result.selection).toHaveLength(0);
    expect(result.unresolved).toEqual(['15 · Mantenimiento persiana grandes dimensiones']);
  });
});
