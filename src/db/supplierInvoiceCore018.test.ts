import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/130_supplier_invoice_core.sql', import.meta.url), 'utf8');
const verify = readFileSync(new URL('../../supabase/verification/verify_130_supplier_invoice_core.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/supplierInvoicesService.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../modules/SupplierInvoicesModule.tsx', import.meta.url), 'utf8');
const rbac = readFileSync(new URL('../auth/rbac.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');

describe('SUPPLIER-INVOICE-CORE-018', () => {
  it('parses migration and read-only verification SQL', async () => {
    const parser = await pgQuery();
    for (const sql of [migration, verify]) expect(parser.parse(sql).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('defines financial header, line snapshots, and separate allocation layer', () => {
    expect(migration).toContain('create table public.supplier_invoices');
    expect(migration).toContain('create table public.supplier_invoice_lines');
    expect(migration).toContain('create table public.supplier_invoice_allocations');
    for (const field of ['supplier_invoice_number', 'invoice_date', 'due_date', 'currency_code', 'subtotal', 'tax_amount', 'total_amount']) expect(migration).toContain(field);
    for (const field of ['description', 'material_id', 'quantity', 'unit_price', 'tax_rate', 'net_amount', 'tax_amount', 'total_amount']) expect(migration).toContain(field);
    for (const field of ['purchase_order_line_id', 'purchase_receipt_line_id', 'allocated_quantity', 'allocated_amount']) expect(migration).toContain(field);
  });

  it('keeps the lifecycle minimal and freezes registered financial data', () => {
    expect(migration).toContain("check (status in ('draft','registered','cancelled'))");
    expect(migration).toContain("old.status = 'registered' and (new.status <> 'cancelled'");
    expect(migration).toContain('dmp_register_supplier_invoice');
    expect(migration).toContain('dmp_cancel_supplier_invoice');
    expect(migration).toContain("'lifecycle','registered'");
    expect(migration).toContain("status = 'draft'");
    expect(migration).toContain("current_setting('dmp.supplier_invoice_lifecycle', true)");
    expect(migration).not.toContain('supplier_invoice_payments');
    expect(migration).not.toContain('warehouse_stock');
    expect(migration).not.toContain('stock_movements');
  });

  it('seeds granular permissions and protects every new table with tenant/platform RLS', () => {
    for (const permission of ['supplier_invoices.read', 'supplier_invoices.create', 'supplier_invoices.update', 'supplier_invoices.register', 'supplier_invoices.cancel']) {
      expect(migration).toContain(`'${permission}'`);
      expect(rbac).toContain(`'${permission}'`);
    }
    expect(permissions).toContain("hasPermission(profile, 'supplier_invoices.read')");
    expect(migration).toContain('public.current_company_id()');
    expect(migration).toContain('public.has_permission');
    expect(migration).toContain('public.is_platform_superadmin()');
    expect(migration).toContain('enable row level security');
    expect(verify).toContain('pg_policies');
    expect(verify).toContain('aclexplode');
    expect(verify).toContain('count(*)=0');
    expect(verify).toContain('conkey=ARRAY');
    expect(verify).toContain('prosecdef');
    expect(verify).toContain('expected_audit_operations');
    expect(verify).toContain("to_regclass('public.'||e.index_name)");
    expect(verify).not.toContain("('public.'||e.index_name)::regclass");
    expect(verify).not.toContain('i.indkey=ARRAY');
    expect(verify).toContain('pg_get_indexdef(i.indexrelid,n,true)');
    expect(verify).toContain('generate_series(1,i.indnkeyatts)');
    expect(verify).toContain('event_mask');
    expect(migration).toContain('revoke all on function public.dmp_supplier_invoice_recalculate(uuid) from public, anon, authenticated');
    expect(verify).toContain('public_supplier_invoice_rpcs');
    expect(verify).toContain('internal_functions_not_executable');
    expect(migration).not.toContain('alter table public.audit_log');
  });

  it('uses the existing locked code generator and exposes no payment behavior', () => {
    expect(migration).toContain("'supplier_invoices'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(service).toContain("p_prefix: 'FPR'");
    expect(service).toContain("dmp_register_supplier_invoice");
    expect(service).not.toContain('invoice_payments');
    expect(ui).toContain('Facturas de proveedor');
    expect(ui).toContain('Registrar factura');
    expect(ui).toContain('Vincular');
    expect(ui).not.toContain('warehouse_stock');
    expect(ui).not.toContain('invoice_payments');
  });

  it('preserves PO and receipt snapshots by only allocating to them', () => {
    expect(migration).toContain('supplier_invoice_allocations_order_line_company_fk');
    expect(migration).toContain('supplier_invoice_allocations_receipt_line_company_fk');
    expect(migration).toContain('supplier_invoice_allocations_order_only_unique');
    expect(migration).toContain('supplier_invoice_allocations_receipt_only_unique');
    expect(migration).toContain('supplier_invoice_allocations_order_receipt_unique');
    expect(migration).toContain('las asignaciones superan el total de la línea');
    expect(migration).toContain('identidad de línea protegida');
    expect(migration).toContain("case when tg_op = 'UPDATE' or tg_op = 'DELETE' then old.supplier_invoice_id else new.supplier_invoice_id end");
    expect(migration).toContain("if tg_op = 'DELETE' then");
    expect(migration).toContain('before insert or update or delete on public.supplier_invoice_allocations');
    expect(migration).toContain('created_by = public.current_profile_id()');
    expect(service).toContain('purchase_order_line_id');
    expect(service).toContain('purchase_receipt_line_id');
    expect(migration).not.toContain('update public.purchase_order_lines');
    expect(migration).not.toContain('update public.purchase_receipt_lines');
  });

  it('keeps the allocation invariant bidirectional and uses the invoice as the lock point', () => {
    expect(migration).toContain('v_existing_allocated');
    expect(migration).toContain('el total de la línea no puede ser inferior a las asignaciones existentes');
    expect(migration).toContain('where company_id = old.company_id and supplier_invoice_line_id = old.id');
    expect(migration).toContain('on delete cascade');
    expect(migration).toContain('select * into v_invoice_line from public.supplier_invoice_lines where id = new.supplier_invoice_line_id');
    expect(migration).not.toContain('select * into v_invoice_line from public.supplier_invoice_lines where id = new.supplier_invoice_line_id and company_id = new.company_id and supplier_invoice_id = new.supplier_invoice_id for update');
    expect(verify).toContain('bidirectional_allocation_invariant');
    expect(verify).toContain('allocation_lock_order');
    expect(verify).toContain('common_invoice_serialization');
  });
});
