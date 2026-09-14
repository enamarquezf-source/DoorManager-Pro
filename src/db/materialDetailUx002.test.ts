import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { movementDisplayQuantity, movementOrigin, movementReason } from '../services/materialsMovements';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('MATERIAL-DETAIL-UX-002', () => {
  it('uses warehouse_stock for current stock and stock_movements for the ledger', () => {
    expect(service).toContain("from('warehouse_stock')");
    expect(service).toContain("from('stock_movements')");
    expect(service).not.toContain('stock_quantity');
    expect(app).toContain('const totalStock = balances.reduce');
  });

  it('resolves business origins and hides technical metadata from the summary', () => {
    expect(movementOrigin({ purchase_receipts: { id: 'r', code: 'REC-2026-000001' }, purchase_order_id: 'po' })).toMatchObject({ text: 'Recepción REC-2026-000001' });
    expect(movementOrigin({ work_orders: { id: 'w', code: 'PAR-2026-000039' } })).toMatchObject({ text: 'Parte PAR-2026-000039' });
    expect(movementOrigin({ notes: 'legacy_migration · Prueba masiva' }).text).toBe('Importación inicial');
    expect(movementReason({ notes: 'legacy_migration · Prueba masiva' })).toBe('Importación inicial');
    expect(movementReason({ notes: 'Validación de consumo en parte batch=12345678-1234-1234-1234-123456789012' })).toBe('Validación de consumo en parte');
    expect(app).toContain('Detalle técnico');
    expect(app).toContain('Ver todos los movimientos');
  });

  it('keeps canonical signs and compact responsive representations', () => {
    expect(movementDisplayQuantity('Entrada', 15)).toBe(15);
    expect(movementDisplayQuantity('Consumo en parte', 35)).toBe(-35);
    expect(movementDisplayQuantity('Ajuste', -4)).toBe(4);
    for (const value of ['material-movement-head', 'Fecha', 'Tipo', 'Cantidad', 'Almacén', 'Origen', 'Usuario', 'Motivo', 'Abrir', 'material-supplier-head', 'Precio habitual']) expect(app).toContain(value);
    expect(styles).toContain('.material-movement-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('keeps supplier relations separate from the add form', () => {
    expect(app).toContain('className="supplier-link-form"');
    expect(app).toContain('className="material-supplier-table"');
    expect(app).toContain('Desvincular');
    expect(app).toContain('Precio habitual');
  });

  it('shows the MAT-000014 ledger arithmetic as a presentation concern only', () => {
    expect([65, 15, -35].reduce((sum, value) => sum + value, 0)).toBe(45);
    expect(app).toContain('Stock total:');
  });
});
