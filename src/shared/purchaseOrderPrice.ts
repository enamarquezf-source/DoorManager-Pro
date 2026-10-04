export type PurchaseOrderPriceResolution = {
  relation: any | null;
  unitPurchasePrice: string;
  ambiguous: boolean;
};

export function defaultPurchaseSupplier(relations: any[], availableSupplierIds: string[]): string {
  const eligible = relations.filter(row => row.active === true && availableSupplierIds.includes(row.supplier_id));
  const preferred = [...new Set<string>(eligible.filter(row => row.is_preferred === true).map(row => row.supplier_id))];
  if (preferred.length === 1) return preferred[0];
  const suppliers = [...new Set<string>(eligible.map(row => row.supplier_id))];
  return suppliers.length === 1 ? suppliers[0] : '';
}

export function resolvePurchaseOrderPrice(relations: any[], supplierId: string | null | undefined): PurchaseOrderPriceResolution {
  const activeRelations = relations.filter((row) => row.active === true && row.supplier_id === supplierId);
  const ambiguous = activeRelations.length > 1;
  const relation = ambiguous ? null : activeRelations[0] ?? null;
  return {
    relation,
    unitPurchasePrice: ambiguous || relation?.purchase_unit_price == null ? '' : String(relation.purchase_unit_price),
    ambiguous,
  };
}
