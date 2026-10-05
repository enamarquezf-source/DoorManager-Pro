import { describe, expect, it } from 'vitest';
import { materialStockLabel } from './materialStockLabel';
describe('material stock explanation', () => {
  it('does not present a historical untraceable deduction as verified warehouse stock', () => {
    expect(materialStockLabel({ stock_validation_status: 'validated', stock_deducted_quantity: '2.00', stock_warehouse_id: null })).toContain('sin trazabilidad');
  });
  it('distinguishes a pending capture from a validated canonical consumption', () => {
    expect(materialStockLabel({ stock_validation_status: 'pending', stock_deducted_quantity: 0 })).toBe('Pendiente de validar');
    expect(materialStockLabel({ stock_validation_status: 'validated', stock_deducted_quantity: 2, stock_warehouse_id: 'warehouse' })).toBe('Validado');
    expect(materialStockLabel({ stock_validation_status: 'rejected' })).toBe('Consumo rechazado');
  });
});
