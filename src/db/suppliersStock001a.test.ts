import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/117_suppliers_material_relations.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_117_suppliers_material_relations.sql', import.meta.url), 'utf8');
const hardeningMigration = readFileSync(new URL('../../supabase/migrations/118_harden_supplier_permissions.sql', import.meta.url), 'utf8');
const hardeningVerification = readFileSync(new URL('../../supabase/verification/verify_118_harden_supplier_permissions.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/suppliersService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const materials = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');

describe('SUPPLIERS-STOCK-001A', () => {
  it('creates a tenant-safe material supplier relation with one preferred supplier', () => {
    expect(migration).toContain('create table public.material_suppliers');
    expect(migration).toContain('material_suppliers_unique_relation');
    expect(migration).toContain('material_suppliers_one_preferred_idx');
    expect(migration).toContain('where is_preferred = true and active = true');
    expect(migration).toContain('material_suppliers_material_company_fk');
    expect(migration).toContain('material_suppliers_supplier_company_fk');
  });

  it('defines explicit RLS and grants for both catalog surfaces', () => {
    for (const policy of ['suppliers_select_backoffice', 'suppliers_insert_backoffice', 'suppliers_update_backoffice', 'material_suppliers_select_backoffice', 'material_suppliers_insert_backoffice', 'material_suppliers_update_backoffice']) expect(migration).toContain(policy);
    expect(migration).not.toContain('material_suppliers_delete_backoffice');
    expect(migration).not.toMatch(/grant[^;]*delete[^;]*material_suppliers/i);
    expect(migration).toContain('revoke delete on public.suppliers from authenticated');
    expect(migration).toContain('revoke delete on public.material_suppliers from authenticated');
    expect(migration).toContain('alter table public.suppliers enable row level security');
    expect(migration).toContain('alter table public.material_suppliers enable row level security');
    expect(verification).toContain('pg_policies');
    expect(verification).toContain('role_table_grants');
    expect(migration).toContain("with check (company_id = public.current_company_id()\n    and public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']))");
  });

  it('exposes supplier CRUD and material relation operations without legacy stock', () => {
    for (const operation of ['list', 'get', 'create', 'update', 'setActive', 'listMaterialSuppliers', 'addMaterialSupplier', 'updateMaterialSupplier', 'deactivateMaterialSupplier', 'setPreferredMaterialSupplier']) expect(service).toContain(`${operation}`);
    expect(app).toContain('function SuppliersModule');
    expect(app).toContain('function SupplierForm');
    expect(app).toContain('function MaterialSuppliersEditor');
    expect(app).toContain("moduleId === 'proveedores'");
    expect(permissions).toContain("path.startsWith('/app/modulos/proveedores')");
    expect(materials).not.toContain('stock_quantity');
  });

  it('keeps the scope limited to suppliers and relations', () => {
    expect(migration).not.toMatch(/create table public\.(purchase|purchase_orders|receipts|invoices)/i);
    expect(migration).not.toContain('single_use');
    expect(migration).not.toContain('made_to_measure');
    expect(migration).not.toContain('warehouse_stock');
    expect(migration).not.toContain('stock_movements');
  });

  it('keeps unknown supplier prices nullable and rejects negatives', () => {
    expect(migration).toContain('purchase_unit_price numeric(12,2) check (purchase_unit_price is null or purchase_unit_price >= 0)');
    expect(migration).not.toMatch(/purchase_unit_price numeric\(12,2\) not null/i);
    expect(migration).not.toMatch(/purchase_unit_price[^,]*default 0/i);
    expect(service).toContain('value === null || value === undefined || value === \'\' ? null : Number(value)');
    expect(app).toContain("String(row.purchase_unit_price ?? '')");
  });

  it('unlinks without hard delete and reactivates existing relations', () => {
    expect(service).toContain("update({ active: false, is_preferred: false");
    expect(service).not.toMatch(/from\('material_suppliers'\)[\s\S]*?\.delete\(/);
    expect(service).toContain('reactivate material supplier');
    expect(migration).toContain('where is_preferred = true and active = true');
  });

  it('preserves the existing nullable stock supplier contract', () => {
    expect(verification).toContain("'public.stock_movements'::regclass");
    expect(verification).toContain("'public.suppliers'::regclass");
    expect(verification).toContain('stock_movements.supplier_id must be nullable uuid');
    expect(verification).toContain("proname = 'current_company_id'");
    expect(verification).toContain("proname = 'has_any_role'");
    expect(verification).toContain('policy scope is invalid');
    expect(verification).toContain('unexpected suppliers policy broadens the contract');
  });

  it('preserves platform superadmin scope and hardens catalog privileges', () => {
    for (const name of ['suppliers_platform_superadmin_select', 'suppliers_platform_superadmin_insert', 'suppliers_platform_superadmin_update', 'material_suppliers_platform_superadmin_select', 'material_suppliers_platform_superadmin_insert', 'material_suppliers_platform_superadmin_update']) {
      expect(verification).toContain(name);
      expect(hardeningMigration).toContain(name);
    }
    expect(hardeningMigration).toContain('revoke all privileges on public.suppliers from anon');
    expect(hardeningMigration).toContain('revoke all privileges on public.material_suppliers from anon');
    expect(hardeningMigration).toContain('revoke delete, truncate, references, trigger on public.suppliers from authenticated');
    expect(hardeningMigration).toContain('revoke delete, truncate, references, trigger on public.material_suppliers from authenticated');
    expect(hardeningVerification).toContain('anon has a privilege');
    expect(hardeningVerification).toContain('forbidden privilege');
    expect(hardeningVerification).toContain('supplier catalog DELETE policy exists');
  });
});
