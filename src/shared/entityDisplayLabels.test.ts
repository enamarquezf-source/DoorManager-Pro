import { describe, expect, it } from 'vitest';
import { formatCenterLabel, formatClientLabel, formatEntityLabel, formatEquipmentLabel, formatMaterialLabel, formatSupplierLabel } from './entityDisplayLabels';

describe('entity display labels', () => {
  it('puts readable names before codes', () => {
    expect(formatClientLabel({ legal_name: 'Industrias López', code: 'CLI-000021' })).toBe('Industrias López · CLI-000021');
    expect(formatMaterialLabel({ description: 'Cable acero 3mm', code: 'MAT-000004' })).toBe('Cable acero 3mm · MAT-000004');
    expect(formatSupplierLabel({ name: 'Proveedor Norte', internal_code: 'PRO-002' })).toBe('Proveedor Norte · PRO-002');
  });

  it('includes center context and falls back to code only when needed', () => {
    expect(formatCenterLabel({ name: 'Planta Zaragoza - Muelle 3', code: 'CEN-000145', clients: { legal_name: 'Industrias López' } })).toBe('Planta Zaragoza - Muelle 3 · CEN-000145 · Cliente: Industrias López');
    expect(formatCenterLabel({ code: 'CEN-000145' })).toBe('CEN-000145');
  });

  it('keeps equipment operational details ahead of its code', () => {
    expect(formatEquipmentLabel({ code: 'EQ-1', equipment_types: { name: 'Puerta seccional' }, brand: 'Acme', model: 'X1' })).toBe('Puerta seccional · Acme X1 · EQ-1');
  });

  it('uses the correct entity formatter without changing identifiers', () => {
    expect(formatEntityLabel({ id: 'client-1', legal_name: 'Cliente', code: 'CLI-1' })).toBe('Cliente · CLI-1');
    expect(formatEntityLabel({ id: 'material-1', material_id: 'material-1', description: 'Tornillo', code: 'MAT-1' })).toBe('Tornillo · MAT-1');
  });
});
