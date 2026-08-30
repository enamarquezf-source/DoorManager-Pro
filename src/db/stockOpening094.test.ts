import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('094 initial warehouse stock UI', () => {
  it('exposes the minimum-privilege opening action and fields', () => {
    expect(app).toContain('function StockOpeningPanel');
    expect(app).toContain("['superadmin', 'Gerencia', 'Oficina']");
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

  it('keeps legacy stock as a labelled reference only', () => {
    expect(app).toContain('Stock legacy');
    expect(app).toContain('Stock canonico en este almacen');
    expect(app).toContain('Stock legacy de referencia');
    expect(app).not.toContain('Stock disponible: ${selectedStock');
  });
});
