import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('treasury movement history UX 028', () => {
  const module = readFileSync('src/modules/TreasuryModule.tsx', 'utf8');
  const service = readFileSync('src/services/treasuryService.ts', 'utf8');
  const styles = readFileSync('src/styles.css', 'utf8');
  const migration = readFileSync('supabase/migrations/137_treasury_historical_backfill.sql', 'utf8');

  it('uses human labels, signed amounts and historical context', () => {
    expect(module).toContain('Cobro de cliente');
    expect(module).toContain('Pago a proveedor');
    expect(module).toContain('Movimiento manual');
    expect(module).toContain('Transferencia entre cuentas');
    expect(module).toContain("row.direction === 'inflow' ? '+' : '-'");
    expect(module).toContain('Histórico anterior al saldo inicial');
    expect(module).toContain('No afecta al Saldo DMP');
    expect(module).not.toContain('>payment<');
    expect(styles).toContain('treasury-movement-card');
  });

  it('resolves payment origins in batches and exposes safe navigation', () => {
    expect(service).toContain('Promise.all([');
    expect(service).toContain("from('invoice_payments')");
    expect(service).toContain("from('supplier_invoice_payments')");
    expect(service).toContain("in('id', customerIds)");
    expect(service).toContain("in('id', supplierIds)");
    expect(service).toContain('invoices(id,code,client_id,clients(id,code,legal_name))');
    expect(service).toContain('supplier_invoices(id,code,supplier_invoice_number,supplier_id,suppliers(id,name))');
    expect(module).toContain('/app/modulos/facturacion?invoice=');
    expect(module).toContain('/app/modulos/facturas-proveedor?id=');
    expect(module).toContain('/clientes/${invoice.clients.id}');
    expect(module).toContain('role="button"');
    expect(module).toContain('Ver cobro');
    expect(module).toContain('Ver factura proveedor');
  });

  it('keeps balance calculation separate from history presentation', () => {
    expect(migration).toContain('t.transaction_date >= a.opening_balance_date');
    expect(module).toContain('row.transaction_date < account.opening_balance_date');
    expect(module).not.toContain('row.transaction_date >= account.opening_balance_date');
    expect(module).toContain('row.reversed_at');
    expect(module).toContain('transfer_group_id');
  });
});
