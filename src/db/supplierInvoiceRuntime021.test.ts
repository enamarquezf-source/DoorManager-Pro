import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const service = read('../services/supplierInvoicesService.ts');
const invoices = read('../modules/SupplierInvoicesModule.tsx');
const app = read('../App.tsx');

describe('SUPPLIER-INVOICE-RUNTIME-021', () => {
  it('loads invoice data deterministically without the invalid nested select', () => {
    expect(service).toContain("select('*').eq('id', id).maybeSingle()");
    for (const table of ['supplier_invoice_lines', 'supplier_invoice_allocations', 'supplier_invoice_payments']) expect(service).toContain(`from('${table}')`);
    for (const table of ['materials', 'purchase_orders', 'purchase_order_lines', 'purchase_receipts', 'purchase_receipt_lines']) expect(service).toContain(`loadByIds('${table}'`);
    expect(service).not.toContain('supplier_invoice_allocations(*,purchase_orders(');
    expect(service).toContain('purchaseOrderContext');
  });

  it('keeps invoice creation as a confirmed draft and supports deep links', () => {
    expect(invoices).toContain("params.get('order')");
    expect(invoices).toContain("params.get('supplier')");
    expect(invoices).toContain('supplierInvoicesService.createDraft');
    expect(invoices).toContain('onSaved={(id) => navigate(`/app/modulos/facturas-proveedor?id=${id}`)}');
    expect(invoices).toContain('Revisa y confirma las líneas sugeridas');
  });

  it('offers contextual supplier invoice creation from a purchase order with the right permission', () => {
    expect(app).toContain("hasPermission(profile, 'supplier_invoices.create')");
    expect(app).toContain('Registrar factura de proveedor');
    expect(app).toContain('supplier=${props.supplier_id ??');
    expect(app).toContain('order=${props.id}');
  });
});
