import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../routing/appRoutes.ts', import.meta.url), 'utf8');

describe('MATERIAL-DETAIL-PAGE-005', () => {
  it('defines a dedicated material route and opens the material from the old actions', () => {
    expect(routes).toContain('/^\\/app\\/modulos\\/materiales\\/([^/]+)$/');
    expect(app).toContain('function MaterialDetailPage');
    expect(app).toContain('tab=movimientos');
    expect(app).toContain('editar=1');
  });

  it('renders material identity and summary metrics', () => {
    for (const text of ['Ficha de material', 'Stock actual', 'Stock mínimo', 'Coste', 'Precio de venta', 'Proveedor preferente', 'Editar material', 'Ajustar stock', 'Comprar']) expect(app).toContain(text);
    expect(app).toContain('{data.code}');
    expect(app).toContain('{data.description}');
    expect(app).toContain('Number(data.cost ?? 0)');
    expect(app).toContain('Number(data.price ?? 0)');
  });

  it('uses canonical stock and preserves the existing edit form', () => {
    expect(app).toContain("workOrdersService.warehouseStockCatalog()");
    expect(app).toContain('const totalStock = balances.reduce');
    expect(app).toContain('MaterialMasterForm initial={data}');
    expect(app).toContain('redirectExisting={false}');
    expect(app).toContain('materialsService.update(initial.id, values)');
    expect(app).toContain('warehouse_stock');
    expect(app).not.toContain('materials.stock_quantity');
  });

  it('keeps stock adjustment behind the existing permission', () => {
    expect(app).toContain("hasPermission(profile, 'stock.adjust')");
    expect(app).toContain('materialsService.adjustStock(material.id, values)');
    expect(app).toContain('CanonicalStockAdjustForm');
  });

  it('renders movements inside the page with the operational columns', () => {
    expect(app).toContain('function MaterialMovementsSection');
    expect(app).toContain('tab === \'movimientos\'');
    for (const column of ['Fecha', 'Tipo', 'Cantidad', 'Almacén', 'Origen', 'Usuario', 'Motivo', 'Acción']) expect(app).toContain(`<th>${column}</th>`);
    expect(app).toContain('MaterialMovementsSection material={data}');
    expect(app).toContain('movementReason(row)');
    expect(app).toContain('Detalle');
  });

  it('reuses material supplier management and shows the preferred supplier', () => {
    expect(app).toContain('MaterialSuppliersEditor materialId={data.id}');
    expect(app).toContain('relations.data.find((row: any) => row.active !== false && row.is_preferred)');
    for (const text of ['Proveedor', 'Referencia', 'Precio habitual', 'Preferente', 'Desvincular']) expect(app).toContain(text);
  });

  it('replaces the old movement drawer as the primary flow', () => {
    expect(app).toContain('return <Navigate to={`/app/modulos/materiales/${material.id}?tab=movimientos`} replace />;');
    const modal = app.slice(app.indexOf('function CanonicalStockMovementsModal'), app.indexOf('function SuperadminUsers'));
    expect(modal.indexOf('return <Navigate')).toBeGreaterThan(-1);
    expect(modal.indexOf('return <Navigate')).toBeLessThan(modal.indexOf('return <MaterialMovementsView'));
    expect(styles).toContain('.material-detail-page');
    expect(styles).toContain('.material-page-movements');
  });

  it('provides responsive cards and controlled movement table overflow', () => {
    expect(styles).toContain('.material-summary-grid { display: grid;');
    expect(styles).toContain('.material-page-movements { overflow-x: auto;');
    expect(styles).toContain('.material-page-movements thead { display: none; }');
    expect(styles).toContain('.material-page-movements tr { display: grid;');
    expect(styles).toContain('.material-detail-actions { display: grid;');
  });

  it('does not add ledger or stock writes to the page flow', () => {
    expect(materialsService).not.toContain('insert into public.stock_movements');
    expect(materialsService).not.toContain('update public.warehouse_stock');
    expect(app).not.toContain('materialsService.movements(material.id).insert');
    expect(app).not.toContain('warehouse_stock.update');
  });

  it('keeps the page UI free of raw technical movement values', () => {
    expect(app).not.toMatch(/>\s*svg\s*</i);
    expect(app).not.toContain('{row.id}</td>');
    expect(app).toContain("[row.source, row.source_reference, row.idempotency_key, row.id]");
  });
});
