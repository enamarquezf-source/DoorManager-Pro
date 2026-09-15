import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../shared/purchaseOrderPrice.ts', import.meta.url), 'utf8');
const lineForm = app.slice(app.indexOf('function PurchaseOrderLineForm'), app.indexOf('function PurchaseReceiptForm'));
const contextualFlow = app.slice(app.indexOf('function ContextualPurchaseFlow'), app.indexOf('function PurchaseOrdersModule'));

describe('MATERIAL-PURCHASE-PRICE-009', () => {
  it('uses one pure exact active supplier resolver in both flows', () => {
    expect(app).toContain("from './shared/purchaseOrderPrice'");
    expect(lineForm).toContain('resolvePurchaseOrderPrice');
    expect(contextualFlow).toContain('resolvePurchaseOrderPrice');
    expect(helper).toContain('activeRelations.length > 1');
    expect(helper).toContain('ambiguous');
    expect(helper).not.toContain('cost');
  });

  it('keeps missing relations manual and never crosses suppliers', () => {
    expect(lineForm).toContain('const matching = relations.data.filter((row: any) => row.supplier_id === order.supplier_id');
    expect(lineForm).toContain('También puedes continuar como línea manual.');
    expect(contextualFlow).toContain('const effectiveSupplierId = mode === \'new\' ? supplierId : selectedDraft?.supplier_id;');
    expect(contextualFlow).toContain('material_supplier_id: priceResolution.relation?.id ?? null');
    expect(contextualFlow).not.toContain('?? preferred');
    expect(contextualFlow).not.toContain('material.cost');
  });

  it('preserves edits, forwards the editable price, and performs no relation or stock writes', () => {
    expect(lineForm).toContain("unit_purchase_price: initial?.unit_purchase_price == null ? '' : String(initial.unit_purchase_price)");
    expect(lineForm).toContain('if (!initial?.id');
    expect(lineForm).not.toContain('suppliersService.addMaterialSupplier');
    expect(contextualFlow).toContain('unit_purchase_price: price === \'\' ? null : price');
    expect(contextualFlow).toContain('onChange={(event) => setPrice(event.target.value)}');
    expect(contextualFlow).not.toContain('suppliersService.addMaterialSupplier');
    expect(contextualFlow).not.toMatch(/stock|warehouseStock|material\.cost/i);
    expect(contextualFlow).not.toMatch(/\b(sql|insert into|delete from)\b/i);
  });
});
