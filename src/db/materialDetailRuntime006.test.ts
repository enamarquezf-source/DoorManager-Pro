import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isValidMaterialId } from '../services/materialsService';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const suppliersService = readFileSync(new URL('../services/suppliersService.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../routing/appRoutes.ts', import.meta.url), 'utf8');

const materialId = '11111111-1111-4111-8111-111111111111';

describe('MATERIAL-DETAIL-RUNTIME-006', () => {
  it('accepts UUID identity and rejects empty or operational-code identifiers', () => {
    expect(isValidMaterialId(materialId)).toBe(true);
    expect(isValidMaterialId('')).toBe(false);
    expect(isValidMaterialId('MAT-000004')).toBe(false);
  });

  it('passes the URL-resolved UUID into the page and never queries an invalid id', () => {
    expect(app).toContain('function MaterialDetailPage({ forcedId }: { forcedId?: string } = {})');
    expect(app).toContain("const { id: routeId = '' } = useParams(); const id = forcedId ?? routeId;");
    expect(app).toContain("route?.kind === 'material'");
    expect(routes).toContain("kind: 'material', id: match[1]");
    expect(app).toContain('validId ? materialsService.get(id) : Promise.resolve(null)');
    expect(app).toContain('validId ? suppliersService.listMaterialSuppliers(id) : Promise.resolve([])');
    expect(materialsService).toContain('if (!isValidMaterialId(id)) throw invalidMaterialIdError();');
    expect(materialsService).toContain('if (!isValidMaterialId(materialId)) return Promise.reject(invalidMaterialIdError());');
    expect(suppliersService).toContain('if (!isValidMaterialId(materialId)) throw new Error');
  });

  it('keeps movements tied to the resolved material UUID', () => {
    expect(app).toContain('MaterialMovementsSection material={data}');
    expect(app).toContain('materialsService.movements(material.id)');
    expect(app).toContain('const balances = stock.data.filter((row: any) => row.material_id === data.id)');
  });

  it('provides a controlled invalid-route state and supports direct refresh', () => {
    expect(app).toContain('No se ha podido identificar el material.');
    expect(app).toContain('to="/app/modulos/materiales"');
    expect(app).toContain('forcedId ?? routeId');
  });

  it('renders React nodes instead of stringifying SVG elements', () => {
    expect(app).toContain("<dd>{value ?? '-'}</dd>");
    expect(app).not.toContain("<dd>{String(value ?? '-')}</dd>");
    const page = app.slice(app.indexOf('function MaterialDetailPage'), app.indexOf('function MaterialDetailPanelLegacy'));
    expect(page).not.toMatch(/>\s*svg\s*</i);
    expect(page).toContain('← Volver a materiales');
    expect(app).toContain('<Factory {...iconProps} />');
    expect(app).toContain('<Menu {...iconProps} />');
  });

  it('does not change stock or ledger write paths', () => {
    expect(app).not.toContain('warehouse_stock.update');
    expect(app).not.toContain('stock_movements.insert');
    expect(materialsService).not.toContain('insert into public.stock_movements');
    expect(materialsService).not.toContain('update public.warehouse_stock');
  });
});
