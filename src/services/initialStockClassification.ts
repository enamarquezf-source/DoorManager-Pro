export type InitialStockStatus = 'NO_CANONICAL_STOCK' | 'CANONICAL_EXISTS' | 'CANONICAL_CONFIRMED';
type InitialStockClassification = { canonicalTotal: number; status: string; legacy: number };

export function classifyInitialStockMaterial(_material: Record<string, unknown>, canonical: Array<{ quantity?: number | string | null }>): InitialStockClassification {
  const canonicalTotal = canonical.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);

  if (canonical.length > 0) {
    return { canonicalTotal, status: 'CANONICAL_EXISTS' as const, legacy: 0 };
  }
  return { canonicalTotal, status: 'NO_CANONICAL_STOCK' as const, legacy: 0 };
}

export function buildInitialStockRows(materials: any[], canonicalStock: any[], reconciliations: any[] = []) {
  return materials.map((material) => {
    const canonical = canonicalStock.filter((item) => item.material_id === material.id);
    const classification = classifyInitialStockMaterial(material, canonical);
    const reconciliation = canonical.length === 1 ? reconciliations.find((item) => item.material_id === material.id && item.warehouse_id === canonical[0].warehouse_id && Number(item.confirmed_quantity) === Number(canonical[0].quantity)) : undefined;
    return { material, canonical, ...classification, status: reconciliation ? 'CANONICAL_CONFIRMED' as const : classification.status, reconciliation };
  });
}

export function initialStockCounters(rows: Array<{ status: string }>) {
  return {
    pending: rows.filter((row) => row.status === 'NO_CANONICAL_STOCK').length,
    opened: rows.filter((row) => ['CANONICAL_EXISTS', 'CANONICAL_CONFIRMED'].includes(row.status)).length,
    review: 0,
    zero: 0,
  };
}
