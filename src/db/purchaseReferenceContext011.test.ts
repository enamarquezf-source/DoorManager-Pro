import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const purchaseOrders = readFileSync(new URL('../services/purchaseOrdersService.ts', import.meta.url), 'utf8');
const materials = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const movements = readFileSync(new URL('../services/materialsMovements.ts', import.meta.url), 'utf8');
const contextual = app.slice(app.indexOf('function ContextualPurchaseFlow'), app.indexOf('function PurchaseOrdersModule'));
const receipt = app.slice(app.indexOf('function PurchaseReceiptForm'), app.indexOf('function PurchaseOrderDetail'));

describe('PURCHASE-REFERENCE-CONTEXT-011', () => {
  it('uses the canonical order reference for new and existing flows', () => {
    expect(contextual).toContain('supplier_reference: supplierReference');
    expect(contextual).toContain('selectedDraft?.supplier_reference');
    expect(contextual).toContain("hasPermission(profile, 'purchase_orders.update')");
    expect(contextual).toContain('purchaseOrdersService.update');
    expect(contextual).not.toContain("['purchase_orders', 'up' + 'date'].join('.')");
    expect(contextual).not.toContain("purchaseOrdersService['up' + 'date']");
    expect(contextual).toContain('supplier_id: selectedDraft.supplier_id');
    expect(contextual).toContain('order_date: selectedDraft.order_date');
    expect(contextual).toContain('destination_warehouse_id: selectedDraft.destination_warehouse_id');
    expect(contextual).toContain('purchaseOrdersService.addLine');
    expect(app).not.toContain('supplier_reference`');
  });

  it('keeps line forms free of order-reference inputs and receipt fields separate', () => {
    const lineForm = app.slice(app.indexOf('function PurchaseOrderLineForm'), app.indexOf('function LegacyPurchaseReceiptForm'));
    expect(lineForm).not.toContain('label="Referencia de compra"');
    expect(receipt).toContain('Referencia proveedor');
    expect(receipt).toContain('Referencia documento proveedor');
    expect(receipt).toContain('readOnly');
    expect(receipt).toContain('supplier_document_reference');
    expect(receipt).toContain('currentReceipt');
  });

  it('preserves relational movement context without stock or ledger writes', () => {
    expect(materials).toContain('purchase_receipts');
    expect(materials).toContain('supplier_document_reference');
    expect(materials).toContain('supplier_reference');
    expect(movements).toContain('reference');
    expect(materials).not.toMatch(/insert into public\.(stock_movements|warehouse_stock)/i);
    expect(materials).not.toMatch(/update public\.(stock_movements|warehouse_stock)/i);
    expect(contextual).not.toMatch(/\b(sql|insert into|delete from)\b/i);
  });

  it('forwards the canonical field through the existing service RPC contract', () => {
    expect(purchaseOrders).toContain('p_supplier_reference: clean(payload.supplier_reference)');
    expect(purchaseOrders).not.toContain('supplier_document_reference');
  });
});
