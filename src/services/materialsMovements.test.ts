import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { movementDisplayQuantity, movementDirection, movementLabel, movementLinks } from './materialsMovements';

describe('canonical material movement traceability', () => {
  it('humanizes movement types and derives direction without changing stored quantities', () => {
    expect(movementLabel('Consumo en parte')).toBe('Consumo en parte');
    expect(movementLabel('Devolucion')).toBe('Devolución de material');
    expect(movementDirection('Consumo en parte')).toBe('Salida');
    expect(movementDirection('Devolucion')).toBe('Entrada');
    expect(movementDisplayQuantity('Consumo en parte', 2)).toBe(-2);
    expect(movementDisplayQuantity('Devolucion', 1)).toBe(1);
  });

  it('uses canonical movement history and exact source routes', () => {
    const service = readFileSync('src/services/materialsService.ts', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    const links = readFileSync('src/services/materialsMovements.ts', 'utf8');
    expect(service).toContain("from('stock_movements')");
    expect(service).not.toContain('material_stock_movements');
    expect(app).toContain('movementLinks(movement)');
    expect(links).toContain('`/app/partes/${workOrder.id}`');
    expect(links).toContain('`/app/modulos/presupuestos/${quote.id}`');
  });

  it('only creates exact document links when the relation exists', () => {
    const linked = movementLinks({ work_orders: { id: 'wo-1', code: 'PAR-1', quotes: { id: 'quote-1', code: 'PRE-1' } } });
    expect(linked.workOrder).toEqual({ label: 'PAR-1', to: '/app/partes/wo-1' });
    expect(linked.quote).toEqual({ label: 'PRE-1', to: '/app/modulos/presupuestos/quote-1' });
    expect(movementLinks({ movement_type: 'Devolucion', work_orders: { id: 'wo-1', code: 'PAR-1' } }).workOrder?.to).toBe('/app/partes/wo-1');
    expect(movementLinks({ movement_type: 'Ajuste' })).toEqual({ workOrder: null, quote: null });
  });
});
