import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { filterMaterials, materialDashboardStats } from './materialsDashboard';

const materials = [
  { id: 'A', active: true, minimum_stock: 3, cost: 2 },
  { id: 'B', active: true, minimum_stock: 3, cost: 5 },
  { id: 'C', active: true, minimum_stock: 5, cost: 4 },
  { id: 'D', active: false, minimum_stock: 1, cost: 10 },
];
const stock = [{ material_id: 'A', quantity: 10 }, { material_id: 'B', quantity: 2 }, { material_id: 'C', quantity: 0 }, { material_id: 'D', quantity: 4 }];

describe('canonical materials dashboard', () => {
  it('calculates every indicator from aggregated warehouse stock', () => {
    expect(materialDashboardStats(materials, stock)).toEqual({ total: 4, inStock: 1, lowStock: 1, outOfStock: 1, inactive: 1, inventoryValue: 30 });
  });

  it('intersects stock filters with the existing material search result', () => {
    expect(filterMaterials(materials.filter((item) => item.id.includes('B')), stock, 'low_stock').map((item) => item.id)).toEqual(['B']);
    expect(filterMaterials(materials, stock, 'out_of_stock').map((item) => item.id)).toEqual(['C']);
    expect(filterMaterials(materials, stock, 'inactive').map((item) => item.id)).toEqual(['D']);
    expect(filterMaterials(materials, stock, 'all')).toHaveLength(4);
  });

  it('keeps the active module canonical and exposes authorized mass import', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const module = app.slice(app.indexOf('function CanonicalMaterialsModule'), app.indexOf('function MaterialsModule()'));
    expect(module).toContain('Materiales totales');
    expect(module).toContain('warehouseStockCatalog');
    expect(module).not.toContain('stock_quantity');
    expect(app).toContain('function MaterialBulkImportPanel');
    expect(app).toContain('warehouse_stock');
    expect(app).toContain('stock_movements');
    expect(app).toContain("['superadmin', 'SAT', 'Gerencia', 'Oficina']");
  });
});
