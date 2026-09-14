import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initialReceiptCost, receiptLineProgress } from '../shared/purchaseReceiptUx';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const receiptMigration = readFileSync(new URL('../../supabase/migrations/120_purchase_receipts.sql', import.meta.url), 'utf8');

describe('PURCHASE-RECEIPT-UX-001', () => {
  it('uses a compact desktop table with the required columns and controlled scrolling', () => {
    for (const value of ['receipt-lines-scroll', 'receipt-lines-table', 'Material', 'Pedido', 'Recibido', 'Pendiente', 'Recibir ahora', 'Precio acordado', 'Coste real']) expect(app).toContain(value);
    expect(styles).toContain('max-height: min(56vh, 560px)');
    expect(styles).toContain('position: sticky');
  });

  it('uses a compact responsive card layout on mobile', () => {
    expect(styles).toContain('.receipt-lines-table thead { display: none; }');
    expect(styles).toContain('.receipt-lines-table tr { margin-bottom: 10px');
    expect(styles).toContain('.receipt-header-grid { grid-template-columns: 1fr; }');
  });

  it('calculates pending quantities and bulk fill without confirming', () => {
    expect(receiptLineProgress({ ordered_quantity: 20 }, 7)).toEqual({ ordered: 20, received: 7, pending: 13 });
    expect(app).toContain('Recibir todo lo pendiente');
    expect(app).toContain('setQuantities(Object.fromEntries');
    expect(app).toContain("if (confirmAfter) await purchaseReceiptsService.confirm(id)");
  });

  it('blocks extra quantity for complete lines and keeps partial receipts possible', () => {
    expect(receiptLineProgress({ ordered_quantity: 20 }, 20).pending).toBe(0);
    expect(app).toContain('complete ? <span className="receipt-complete">Completo</span>');
    expect(app).toContain('max={item.pending}');
    expect(receiptMigration).toContain('v_received + v_line.received_quantity > v_ordered');
  });

  it('prefills cost by the literal priority while preserving manual and draft values', () => {
    expect(initialReceiptCost({ unit_purchase_price: 56, material_suppliers: { purchase_unit_price: 58 }, materials: { cost: 40 } })).toBe('56');
    expect(initialReceiptCost({ material_suppliers: { purchase_unit_price: 58 }, materials: { cost: 40 } })).toBe('58');
    expect(initialReceiptCost({ materials: { cost: 40 } })).toBe('40');
    expect(initialReceiptCost({ }, { actual_unit_cost: 61.5 })).toBe('61.5');
    expect(initialReceiptCost({ })).toBe('');
    expect(app).toContain('actual_unit_cost: costs[line.id] === \'\' ? null : costs[line.id]');
    expect(receiptMigration).toContain('coalesce(p_actual_unit_cost,v_line.unit_purchase_price)');
    expect(receiptMigration).toContain('actual_unit_cost=coalesce(p_actual_unit_cost,actual_unit_cost)');
  });

  it('keeps the canonical receipt RPCs, stock confirmation and frozen snapshot untouched', () => {
    for (const value of ['dmp_create_purchase_receipt', 'dmp_update_purchase_receipt', 'dmp_add_purchase_receipt_line', 'dmp_update_purchase_receipt_line', 'dmp_confirm_purchase_receipt']) expect(receiptMigration).toContain(value);
    expect(receiptMigration).toContain("dmp_adjust_warehouse_stock(v_receipt.warehouse_id");
    expect(receiptMigration).toContain("if v_receipt.status = 'confirmed' then return p_receipt_id");
    expect(app).toContain('Guardar borrador');
    expect(app).toContain('Confirmar recepción');
    expect(app).toContain('Guardar borrador no genera stock; confirmar sí genera stock real.');
  });
});
