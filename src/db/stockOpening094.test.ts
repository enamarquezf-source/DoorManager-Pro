import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('094 initial warehouse stock UI', () => {
  it('exposes the minimum-privilege opening action and fields', () => {
    expect(app).toContain('function StockOpeningPanel');
    expect(app).toContain("['superadmin', 'SAT', 'Gerencia', 'Oficina']");
    expect(app).toContain('Material catalogado');
    expect(app).toContain('Almacen activo');
    expect(app).toContain('Cantidad inicial');
    expect(app).toContain('Motivo / observacion');
    expect(app).toContain('Registrar saldo inicial');
    expect(app).toContain('No representa una compra ni una recepcion');
  });

  it('uses the authenticated RPC and protects duplicate submission', () => {
    expect(service).toContain("supabase.rpc('dmp_set_initial_warehouse_stock'");
    expect(app).toContain('disabled={saving}');
    expect(app).toContain('Apertura previa');
    expect(app).toContain('Sin apertura en este almacen');
  });

  it('uses only warehouse stock in the active material module', () => {
    const activeModule = app.slice(app.indexOf('function CanonicalMaterialsModule'), app.indexOf('function MaterialsModule()'));
    expect(activeModule).toContain('warehouseStockCatalog');
    expect(activeModule).not.toContain('Stock legacy');
    expect(app).not.toContain('Stock disponible: ${selectedStock');
  });

  it('captures the final quantity and reason in the confirmation snapshot', () => {
    expect(app).toContain('const [confirmation, setConfirmation]');
    expect(app).toContain('quantity: Number(quantity)');
    expect(app).toContain('reason: reason.trim()');
    expect(app).toContain('confirmation.quantity.toLocaleString');
    expect(app).toContain('{confirmation.reason}');
    expect(app).toContain('openInitialWarehouseStock(confirmation.warehouseId, confirmation.materialId, confirmation.quantity, confirmation.reason)');
    expect(app).toContain("setConfirmation(null); setQuantity(''); setReason('');");
  });
});
