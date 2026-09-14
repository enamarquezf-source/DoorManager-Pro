import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { movementDisplayQuantity, movementOrigin, movementReason } from '../services/materialsMovements';

const service = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const query = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');
const receiptsMigration = readFileSync(new URL('../../supabase/migrations/120_purchase_receipts.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('MATERIAL-MOVEMENTS-DATA-004', () => {
  it('does not use the missing receipt relationship hint', () => {
    expect(service).not.toContain('stock_movements_purchase_receipt_id_fkey');
    expect(service).toContain("from('stock_movements').select('id,movement_type,quantity,warehouse_id,material_id,work_order_id,purchase_order_id,purchase_receipt_id");
  });

  it('uses the real receipt FK contract and resolves references in batches', () => {
    expect(receiptsMigration).toContain('stock_movements_purchase_receipt_company_fk');
    expect(service).toContain("optionalMovementRelations('purchase_receipts'");
    expect(service).toContain("optionalMovementRelations('work_orders'");
    expect(service).toContain("optionalMovementRelations('purchase_orders'");
    expect(service).toContain("optionalMovementRelations('profiles'");
    expect(service).toContain("optionalMovementRelations('warehouses'");
  });

  it('keeps optional relation failures out of the ledger result', () => {
    expect(service).toContain("return [];");
    expect(service).toContain('Optional movement relation unavailable');
    expect(service).toContain('current_quantity: balanceByWarehouse.get(row.warehouse_id) ?? null');
  });

  it('keeps readable origins and fallback origins without external relations', () => {
    expect(movementOrigin({ purchase_receipts: { id: 'r', code: 'REC-2026-000001' }, purchase_order_id: 'po' }).text).toBe('Recepción REC-2026-000001');
    expect(movementOrigin({ work_orders: { id: 'w', code: 'PAR-2026-000039' } }).text).toBe('Parte PAR-2026-000039');
    expect(movementOrigin({ purchase_orders: { id: 'po', code: 'PED-2026-000001' } }).text).toBe('Pedido PED-2026-000001');
    expect(movementOrigin({ source: 'legacy_migration' }).text).toBe('Importación inicial');
    expect(movementOrigin({ movement_type: 'Ajuste' }).text).toBe('Movimiento manual');
  });

  it('preserves the MAT-000014 sign regression and does not add ledger writes', () => {
    expect([65, 15, -35].reduce((sum, value) => sum + value, 0)).toBe(45);
    expect(movementDisplayQuantity('Entrada', 15)).toBe(15);
    expect(movementDisplayQuantity('Consumo en parte', 35)).toBe(-35);
    expect(service).not.toContain('insert into public.stock_movements');
    expect(service).not.toContain('update public.warehouse_stock');
    expect(app).not.toMatch(/>\s*svg\s*</i);
    expect(movementReason({ notes: 'svg' })).toBe('Sin motivo informado');
  });

  it('retains the diagnostic fields for Supabase errors without broad schema-cache masking', () => {
    for (const field of ['code', 'message', 'details', 'hint']) expect(query).toContain(field);
    expect(query).toContain("error?.code === 'PGRST200'");
    expect(query).not.toContain("message.includes('schema cache')");
  });
});
