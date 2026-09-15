import { describe, expect, it } from 'vitest';
import { resolvePurchaseOrderPrice } from './purchaseOrderPrice';

describe('resolvePurchaseOrderPrice', () => {
  it('fixture A returns the active exact-supplier price', () => {
    const result = resolvePurchaseOrderPrice([
      { id: 'inactive', supplier_id: 'supplier-a', purchase_unit_price: 11, active: false },
      { id: 'other', supplier_id: 'supplier-b', purchase_unit_price: 22, active: true },
      { id: 'exact', supplier_id: 'supplier-a', purchase_unit_price: 28, active: true },
    ], 'supplier-a');

    expect(result).toEqual({ relation: { id: 'exact', supplier_id: 'supplier-a', purchase_unit_price: 28, active: true }, unitPurchasePrice: '28', ambiguous: false });
  });

  it('fixture B returns the exact active price 15.50', () => {
    expect(resolvePurchaseOrderPrice([{ supplier_id: 'supplier-a', purchase_unit_price: 15.5, active: true }], 'supplier-a')).toEqual({ relation: { supplier_id: 'supplier-a', purchase_unit_price: 15.5, active: true }, unitPurchasePrice: '15.5', ambiguous: false });
  });

  it('fixture C ignores inactive relations', () => {
    expect(resolvePurchaseOrderPrice([{ supplier_id: 'supplier-a', purchase_unit_price: 28, active: false }], 'supplier-a')).toEqual({ relation: null, unitPurchasePrice: '', ambiguous: false });
  });

  it('ignores relations without an explicit active flag', () => {
    expect(resolvePurchaseOrderPrice([{ supplier_id: 'supplier-a', purchase_unit_price: 28 }], 'supplier-a')).toEqual({ relation: null, unitPurchasePrice: '', ambiguous: false });
  });

  it('fixture D preserves an active relation with a null price', () => {
    expect(resolvePurchaseOrderPrice([{ supplier_id: 'supplier-a', purchase_unit_price: null, active: true }], 'supplier-a')).toEqual({ relation: { supplier_id: 'supplier-a', purchase_unit_price: null, active: true }, unitPurchasePrice: '', ambiguous: false });
  });

  it('fixture E selects the only active row among historical rows', () => {
    expect(resolvePurchaseOrderPrice([{ supplier_id: 'supplier-a', purchase_unit_price: 28, active: false }, { supplier_id: 'supplier-a', purchase_unit_price: 15.5, active: true }], 'supplier-a').unitPurchasePrice).toBe('15.5');
  });

  it('fixture F reports duplicate active rows as ambiguous', () => {
    expect(resolvePurchaseOrderPrice([{ id: 'first', supplier_id: 'supplier-a', purchase_unit_price: 28, active: true }, { id: 'second', supplier_id: 'supplier-a', purchase_unit_price: 15.5, active: true }], 'supplier-a')).toEqual({ relation: null, unitPurchasePrice: '', ambiguous: true });
  });
});
