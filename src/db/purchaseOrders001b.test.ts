import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/119_purchase_orders.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_119_purchase_orders.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/purchaseOrdersService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');

describe('SUPPLIERS-STOCK-001B', () => {
  it('defines purchase order header and lines with tenant-safe composite foreign keys', () => {
    expect(migration).toContain('create table public.purchase_orders');
    expect(migration).toContain('create table public.purchase_order_lines');
    expect(migration).toContain('purchase_orders_supplier_company_fk');
    expect(migration).toContain('purchase_orders_warehouse_company_fk');
    expect(migration).toContain('purchase_order_lines_order_company_fk');
    expect(migration).toContain('purchase_order_lines_material_company_fk');
    expect(migration).toContain('purchase_order_lines_supplier_company_fk');
    expect(migration).toContain('purchase_orders_company_id_id_unique');
  });

  it('keeps snapshots and separates order reference prices from supplier catalog prices', () => {
    for (const column of ['material_description_snapshot', 'supplier_reference_snapshot', 'unit_snapshot', 'ordered_quantity', 'unit_purchase_price', 'subtotal']) expect(migration).toContain(column);
    expect(migration).toContain('v_material.description');
    expect(migration).toContain('v_supplier_relation.supplier_reference');
    expect(migration).toContain('v_price := coalesce(p_unit_purchase_price, v_supplier_relation.purchase_unit_price)');
    expect(migration).not.toContain('material_suppliers set purchase_unit_price');
  });

  it('uses draft, ordered and cancelled lifecycle with ordered price protection', () => {
    expect(migration).toContain("status in ('draft','ordered','cancelled')");
    expect(migration).toContain("solo el borrador es editable");
    expect(migration).toContain("todas las líneas confirmadas necesitan precio acordado");
    expect(migration).toContain("new.status = 'ordered'");
    expect(migration).toContain('dmp_order_purchase_order');
    expect(migration).toContain('dmp_cancel_purchase_order');
  });

  it('calculates totals in database triggers, not only in the frontend', () => {
    expect(migration).toContain('dmp_purchase_order_line_totals');
    expect(migration).toContain('dmp_purchase_order_refresh_totals');
    expect(migration).toContain('total_amount = coalesce');
    expect(service).not.toContain('total_amount:');
    expect(migration).toContain('campos canónicos protegidos');
  });

  it('provides transactional backend operations and no reception or stock mutation', () => {
    for (const operation of ['dmp_create_purchase_order', 'dmp_update_purchase_order', 'dmp_add_purchase_order_line', 'dmp_update_purchase_order_line', 'dmp_remove_purchase_order_line', 'dmp_order_purchase_order', 'dmp_cancel_purchase_order']) expect(migration).toContain(operation);
    for (const operation of ['create', 'update', 'addLine', 'updateLine', 'removeLine', 'markOrdered', 'cancel']) expect(service).toContain(operation);
    for (const forbidden of ['purchase_receipts', 'stock_movements', 'warehouse_stock', 'invoices', 'payments', 'documents']) {
      expect(migration).not.toContain(forbidden);
      expect(service).not.toContain(forbidden);
    }
  });

  it('keeps warehouse destination at header level for future receipt routing', () => {
    expect(migration).toContain('destination_warehouse_id uuid');
    expect(migration).toContain('purchase_orders_warehouse_company_fk');
    expect(app).toContain('Almacén previsto');
    expect(app).not.toContain('transferencias de almacén');
  });

  it('allows a material line without supplier relation but enforces supplier consistency when present', () => {
    expect(migration).toContain('p_material_supplier_id uuid');
    expect(migration).toContain('supplier_id = v_order.supplier_id');
    expect(app).toContain('Se permite una línea manual');
    expect(app).toContain('la relación no se creará automáticamente');
    expect(migration).toContain('and active;');
    expect(migration).toContain('and active');
  });

  it('applies read/write role separation, platform scope and no hard delete', () => {
    expect(permissions).toContain('canViewPurchaseOrders');
    expect(permissions).toContain('canManagePurchaseOrders');
    expect(migration).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(migration).toContain("array['superadmin','Gerencia','Oficina']");
    expect(migration).toContain('purchase_orders_platform_superadmin_select');
    expect(migration).toContain('purchase_order_lines_platform_superadmin_update');
    expect(migration).not.toMatch(/create policy .*purchase.* for delete/i);
    expect(migration).toContain('revoke insert, update, delete, truncate, references, trigger');
    expect(service).not.toMatch(/from\('purchase_orders'\)[\s\S]*?\.insert\(/);
    expect(service).not.toMatch(/from\('purchase_order_lines'\)[\s\S]*?\.update\(/);
    expect(migration).toContain('before insert or update or delete');
  });

  it('provides a strict structural verification without data changes', () => {
    expect(verification).toContain('raise exception');
    expect(verification).toContain('pg_constraint');
    expect(verification).toContain('pg_policies');
    expect(verification).toContain('role_table_grants');
    expect(verification).toContain('proargtypes');
    expect(verification).toContain('purchase_order_line_guard_trigger');
    expect(verification).toContain('prosecdef');
    expect(verification).toContain('has_table_privilege');
    expect(verification).toContain('numeric_precision = 12 and numeric_scale = 2');
    expect(verification).toContain('roles = array[\'authenticated\']::name[]');
    expect(verification).toContain('purchase_order_totals_trigger');
    expect(verification).not.toMatch(/insert\s+into|update\s+public\.|delete\s+from/i);
  });

  it('keeps line ownership immutable and excludes inactive supplier relations', () => {
    expect(migration).toContain('new.purchase_order_id is distinct from old.purchase_order_id');
    expect(migration).toContain('supplier_id = v_order.supplier_id and active');
    expect(migration).toContain('material_supplier_id uuid');
  });
});
