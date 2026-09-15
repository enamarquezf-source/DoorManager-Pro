export type PurchaseOrderPriceResolution = {
  relation: any | null;
  unitPurchasePrice: string;
  ambiguous: boolean;
};

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
