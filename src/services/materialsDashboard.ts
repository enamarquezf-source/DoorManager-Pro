export type MaterialStockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'inactive';

export type MaterialDashboardStats = {
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  inactive: number;
  inventoryValue: number;
};

export function canonicalQuantity(materialId: string, stockRows: Array<{ material_id?: string; quantity?: number | string | null }>) {
  return stockRows.filter((row) => row.material_id === materialId).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
}

export function materialStockState(material: any, quantity: number): Exclude<MaterialStockFilter, 'all'> {
  if (material.active === false) return 'inactive';
  if (quantity <= 0) return 'out_of_stock';
  if (Number(material.minimum_stock ?? 0) > 0 && quantity <= Number(material.minimum_stock)) return 'low_stock';
  return 'in_stock';
}

export function materialDashboardStats(materials: any[], stockRows: any[]): MaterialDashboardStats {
  const visible = materials.filter((material) => !material.deleted_at);
  const states = visible.map((material) => materialStockState(material, canonicalQuantity(material.id, stockRows)));
  return {
    total: visible.length,
    inStock: states.filter((state) => state === 'in_stock').length,
    lowStock: states.filter((state) => state === 'low_stock').length,
    outOfStock: states.filter((state) => state === 'out_of_stock').length,
    inactive: states.filter((state) => state === 'inactive').length,
    inventoryValue: visible.filter((material) => material.active !== false).reduce((sum, material) => sum + canonicalQuantity(material.id, stockRows) * Number(material.cost ?? 0), 0),
  };
}

export function filterMaterials(materials: any[], stockRows: any[], filter: MaterialStockFilter) {
  if (filter === 'all') return materials;
  return materials.filter((material) => materialStockState(material, canonicalQuantity(material.id, stockRows)) === filter);
}
