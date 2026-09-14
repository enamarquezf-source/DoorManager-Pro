import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/120_purchase_receipts.sql', import.meta.url), 'utf8');
const migration124 = readFileSync(new URL('../../supabase/migrations/124_auth_rbac_runtime_fix.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_120_purchase_receipts.sql', import.meta.url), 'utf8');
const verification124 = readFileSync(new URL('../../supabase/verification/verify_124_auth_rbac_runtime_fix.sql', import.meta.url), 'utf8');
const purchaseOrdersMigration = readFileSync(new URL('../../supabase/migrations/119_purchase_orders.sql', import.meta.url), 'utf8');
const suppliersMigration = readFileSync(new URL('../../supabase/migrations/117_suppliers_material_relations.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/purchaseReceiptsService.ts', import.meta.url), 'utf8');

describe('SUPPLIERS-STOCK-001C', () => {
  it('defines tenant-safe receipt headers and lines with immutable snapshots', () => {
    for (const value of ['purchase_receipts', 'purchase_receipt_lines', 'purchase_receipts_order_company_fk', 'purchase_receipts_warehouse_company_fk', 'purchase_receipt_lines_order_line_company_fk', 'description_snapshot', 'actual_unit_cost', 'received_quantity']) expect(migration).toContain(value);
    expect(migration).toContain('received_quantity > 0');
    expect(migration).toContain('purchase_receipts_status_check');
    expect(migration).toContain('purchase_receipt_lines_company_id_id_unique');
    expect(migration).not.toMatch(/received_quantity\s+numeric\(12,2\)\s+not null\s+check/i);
  });
  it('keeps the stock movement receipt-line FK backed by the tenant candidate key', () => {
    expect(migration).toContain('constraint purchase_receipt_lines_company_id_id_unique unique (company_id, id)');
    expect(migration).toContain('constraint stock_movements_purchase_receipt_line_company_fk foreign key (company_id, purchase_receipt_line_id) references public.purchase_receipt_lines(company_id, id)');
    expect(verification).toContain("c.conname = 'purchase_order_lines_company_id_id_unique'");
    expect(verification).toContain("['stock_movements','purchase_receipt_line_id','purchase_receipt_lines']");
  });
  it('defines the order-line candidate key before both dependent FKs', () => {
    expect(migration).toContain('begin;');
    expect(migration.indexOf('purchase_order_lines_company_id_id_unique')).toBeLessThan(migration.indexOf('purchase_receipt_lines_order_line_company_fk'));
    expect(migration.indexOf('purchase_order_lines_company_id_id_unique')).toBeLessThan(migration.indexOf('stock_movements_purchase_order_line_company_fk'));
    expect(verification).toContain("r.relname = 'purchase_order_lines'");
    expect(verification).toContain("c.contype = 'u'");
    expect(verification).toContain('c.conkey = array');
    expect(verification).toContain('receipt-line order-line FK');
    expect(verification).toContain('stock movement order-line FK');
  });
  it('audits every composite tenant FK in migration 120 against a real candidate key', () => {
    const keys = `${purchaseOrdersMigration}\n${suppliersMigration}\n${migration}`;
    for (const table of ['purchase_orders', 'warehouses', 'suppliers', 'materials', 'purchase_order_lines', 'purchase_receipts', 'purchase_receipt_lines']) {
      expect(keys).toMatch(new RegExp(`${table}_company_id_id_unique[\\s\\S]{0,160}unique\\s*\\(company_id, id\\)`, 'i'));
    }
    const compositeReferences = [...migration.matchAll(/references public\.([a-z_]+)\(company_id, id\)/gi)].map((match) => match[1]);
    expect(compositeReferences).toHaveLength(10);
    expect(new Set(compositeReferences)).toEqual(new Set(['purchase_orders', 'warehouses', 'suppliers', 'materials', 'purchase_order_lines', 'purchase_receipts', 'purchase_receipt_lines']));
  });
  it('calculates partial receipts and protects against over-receipt', () => {
    expect(migration).toContain("pr.status = 'confirmed'");
    expect(migration).toContain('v_received + v_line.received_quantity > v_ordered');
    expect(migration).toContain("'partially_received'");
    expect(migration).toContain("'received'");
    expect(migration).not.toContain('received_quantity_counter');
  });
  it('uses canonical stock and one ledger movement per receipt line', () => {
    expect(migration).toContain('dmp_adjust_warehouse_stock');
    expect(migration).toContain('insert into public.warehouse_stock');
    expect(migration).toContain('stock_movements_purchase_receipt_line_once');
    expect(migration).toContain('purchase_receipt_line_id');
    expect(migration).toContain("v_key := 'purchase-receipt-line:' || v_line.id");
    expect(migration).not.toContain('materials.stock_quantity');
  });
  it('rejects incompatible idempotent movements before enrichment', () => {
    expect(migration).toContain("v_existing.movement_type <> p_movement_type");
    expect(migration).toContain('v_existing.quantity <> p_quantity');
    expect(migration).toContain("v_movement.movement_type <> 'Entrada'");
    expect(migration).toContain('v_movement.purchase_receipt_line_id is not null');
    expect(migration).toContain('v_movement.purchase_receipt_id is not null');
    expect(migration).toContain('v_movement.unit_cost is not null');
    expect(migration).toContain('movimiento idempotente no corresponde');
  });
  it('preserves canonical stock semantics while opening absent balances', () => {
    for (const value of ['p_quantity is null or p_quantity <= 0', "p_movement_type not in ('Entrada','Salida','Devolucion','Ajuste')", 'has_any_role', 'v_new < 0', 'allow_negative_stock', 'on conflict (warehouse_id, material_id) do nothing', 'for update', 'insert into public.stock_movements']) expect(migration).toContain(value);
    expect(migration).toContain('security definer');
    expect(migration).toContain('search_path = public');
  });
  it('does not cancel partially received orders or orders with confirmed receipts', () => {
    expect(migration).toContain("old.status = 'partially_received' and new.status not in ('partially_received','received')");
    expect(migration).toContain("old.status = 'ordered' and exists (select 1 from public.purchase_receipts where purchase_order_id = new.id and status = 'confirmed')");
    expect(migration).toContain("old.status in ('received','cancelled')");
  });
  it('certifies strict structural contracts', () => {
    for (const value of ['pg_index', 'indisunique', 'indkey[0]', 'indpred', 'pg_namespace', 'pg_constraint', 'proargtypes[0]', 'prorettype', 'aclexplode', 'grantee=0', 'has_table_privilege', '(t.tgtype&1)=1', 'dmp_purchase_receipt_line_guard']) expect(verification).toContain(value);
    expect(verification).toContain('purchase_receipt_line_idisnotnull');
    expect(verification).toContain('dmp_confirm_purchase_receipt(uuid)');
    expect(verification).toContain("p.proname='dmp_adjust_warehouse_stock'");
    expect(verification).toContain('purchase_order_lines_company_id_id_unique');
    expect(verification).toContain('purchase_receipt_lines_received_quantity_check');
    expect(verification).toContain('received quantity check must exist exactly once');
    expect(verification).toContain('purchase_receipt_lines_actual_cost_check');
    expect(verification).toContain('stock_movements_purchase_unit_cost_check');
    expect(verification).toContain('purchase_receipts_status_check');
    expect(verification).not.toContain('regclass::text');
    expect(verification).not.toContain('oidvector');
    expect(verification).not.toContain('int2vector');
  });
  it('certifies canonical stock security structurally instead of deparsed search_path text', () => {
    expect(verification).toContain("p.proname='dmp_adjust_warehouse_stock'");
    expect(verification).toContain('p.pronargs=6');
    expect(verification).toContain("p.proargtypes[5]='text'::regtype");
    expect(verification).toContain("p.proconfig @> array['search_path=public']");
    expect(verification).toContain("has_function_privilege('authenticated',v_stock_proc,'EXECUTE')");
    expect(verification).toContain("has_function_privilege('anon',v_stock_proc,'EXECUTE')");
    expect(verification).toContain('canonical stock PUBLIC execute ACL');
    expect(verification).not.toMatch(/position\s*\(\s*['"][^'"]*search_path\s*=\s*public[^'"]*['"][\s\S]*pg_get_functiondef/i);
    expect(verification).not.toMatch(/array\['security definer','search_path = public'/i);
  });
  it('exposes only RPC mutations and role-scoped reads', () => {
    for (const operation of ['listForOrder', 'get', 'createDraft', 'updateDraft', 'addLine', 'updateLine', 'removeLine', 'confirm', 'cancelDraft']) expect(service).toContain(operation);
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).toContain("array['superadmin','Gerencia','Oficina']");
    expect(migration).toContain('revoke all privileges on public.purchase_receipts, public.purchase_receipt_lines from authenticated');
    expect(migration).toContain('security definer set search_path = public');
    expect(verification).toContain('pg_class');
    expect(verification).toContain('prosecdef');
    expect(verification).toContain('has_function_privilege');
    expect(verification).not.toMatch(/^\s*(insert|update|delete)\s+/im);
  });
  it('keeps confirmed receipt and lines frozen and retains actual cost', () => {
    expect(migration).toContain('old.status <> \'draft\'');
    expect(migration).toContain('unit_cost=v_line.actual_unit_cost');
    expect(migration).toContain('purchase_order_id=v_receipt.purchase_order_id');
    expect(migration).toContain("if v_receipt.status = 'confirmed' then return p_receipt_id");
  });
  it('keeps all receipt line mutations draft-only and preserves stock traceability', () => {
    const updateLine = migration124.slice(migration124.indexOf('dmp_update_purchase_receipt_line'));
    expect(migration124).toContain("v_receipt.status <> 'draft'");
    expect(updateLine).toContain('v_line public.purchase_receipt_lines');
    expect(updateLine).toContain('v_receipt public.purchase_receipts');
    expect(updateLine).toContain('where id=v_line.purchase_receipt_id for update');
    expect(updateLine).toContain('v_receipt.company_id <> v_line.company_id');
    expect(updateLine).toContain('p_received_quantity is null or p_received_quantity <= 0');
    expect(updateLine).toContain('p_actual_unit_cost is not null and p_actual_unit_cost < 0');
    expect(verification124).toContain('update receipt line immutability');
    expect(verification124).toContain('must require draft receipt');
    expect(migration124).toContain("pr.status='draft'");
    expect(migration124).toContain('purchase_receipt_line_id=v_line.id');
    expect(migration124).toContain('unit_cost=v_line.actual_unit_cost');
  });
  it('keeps receipt immutability checks inside the receipt RPC loop', () => {
    const purchaseLoop = verification124.slice(verification124.indexOf('-- PURCHASE RPCS'), verification124.indexOf('-- RECEIPT RPCS'));
    const receiptLoop = verification124.slice(verification124.indexOf('-- RECEIPT RPCS'));
    for (const signature of ['dmp_add_purchase_receipt_line', 'dmp_update_purchase_receipt_line', 'dmp_remove_purchase_receipt_line']) {
      expect(purchaseLoop).not.toContain(signature);
      expect(receiptLoop).toContain(signature);
    }
    expect(purchaseLoop).not.toContain('must require draft receipt');
    expect(purchaseLoop).not.toContain('update receipt line immutability');
    expect(receiptLoop).toContain('must require draft receipt');
    expect(receiptLoop).toContain('update receipt line immutability');
  });
});
