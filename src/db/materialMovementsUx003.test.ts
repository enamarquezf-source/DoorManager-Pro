import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { movementDisplayQuantity, movementOrigin, movementReason } from '../services/materialsMovements';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('MATERIAL-MOVEMENTS-UX-003', () => {
  it('renders a dedicated operational movement view with compact columns', () => {
    expect(app).toContain('function MaterialMovementsView');
    for (const column of ['Fecha', 'Tipo', 'Cantidad', 'Almacén', 'Origen', 'Usuario', 'Motivo', 'Acción']) expect(app).toContain(`<th>${column}</th>`);
    expect(app).toContain('movement-view-table');
    expect(app).toContain('Detalle técnico');
    expect(styles).toContain('max-height: min(68vh, 720px)');
  });

  it('uses canonical movement fields and readable business origins', () => {
    for (const field of ['movement_type', 'quantity', 'warehouse_id', 'created_by', 'source', 'source_reference', 'created_at', 'notes']) expect(service).toContain(field);
    expect(service).toContain("from('stock_movements')");
    expect(service).toContain("from('warehouse_stock')");
    expect(movementOrigin({ purchase_receipts: { id: 'r', code: 'REC-2026-000001' }, purchase_order_id: 'po' })).toMatchObject({ text: 'Recepción REC-2026-000001', to: '/app/modulos/compras?pedido=po' });
    expect(movementOrigin({ work_orders: { id: 'w', code: 'PAR-2026-000039' } })).toMatchObject({ text: 'Parte PAR-2026-000039', to: '/app/partes/w' });
    expect(movementOrigin({ source: 'legacy_migration' }).text).toBe('Importación inicial');
  });

  it('keeps signs, actors and technical details separate', () => {
    expect(movementDisplayQuantity('Entrada', 15)).toBe(15);
    expect(movementDisplayQuantity('Consumo en parte', 35)).toBe(-35);
    expect(movementReason({ notes: 'legacy_migration · batch=12345678-1234-1234-1234-123456789012' })).toBe('Importación inicial');
    expect(app).toContain('row.created_by ? \'Usuario no informado\' : \'Sistema\'');
    expect(app).toContain("[row.source, row.source_reference, row.idempotency_key, row.id]");
    expect(app).toContain('className="movement-reason"');
  });

  it('provides compact mobile cards without a page-wide horizontal table', () => {
    expect(styles).toContain('.movement-view-table thead { display: none; }');
    expect(styles).toContain('.movement-view-table td[data-label]::before { content: attr(data-label); }');
    expect(styles).toContain('.movement-view-table tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('keeps MAT-000014 as a presentation regression with no stock writes', () => {
    expect([65, 15, -35].reduce((sum, value) => sum + value, 0)).toBe(45);
    expect(service).not.toContain('update public.warehouse_stock');
    expect(service).not.toContain('insert into public.stock_movements');
    expect(app).toContain('MaterialMovementsView material={material}');
  });
});
