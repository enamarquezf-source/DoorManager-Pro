import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/suppliersService.ts', import.meta.url), 'utf8');
const purchaseService = readFileSync(new URL('../services/purchaseOrdersService.ts', import.meta.url), 'utf8');
const relationMigration = readFileSync(new URL('../../supabase/migrations/117_suppliers_material_relations.sql', import.meta.url), 'utf8');
const archiveMigration = readFileSync(new URL('../../supabase/migrations/126_purchase_order_archive.sql', import.meta.url), 'utf8');
const archiveVerification = readFileSync(new URL('../../supabase/verification/verify_126_purchase_order_archive.sql', import.meta.url), 'utf8');

describe('SUPPLIER-MATERIAL-UX-001 / PURCHASE-ORDERS-UX-001', () => {
  it('uses the existing tenant-safe material supplier contract', () => {
    for (const column of ['material_id', 'supplier_id', 'supplier_reference', 'purchase_unit_price', 'is_preferred', 'active', 'company_id']) expect(service).toContain(column);
    expect(relationMigration).toContain('material_suppliers_unique_relation');
    expect(relationMigration).toContain('material_suppliers_material_company_fk');
    expect(relationMigration).toContain('material_suppliers_supplier_company_fk');
    for (const operation of ['listMaterialSuppliers', 'addMaterialSupplier', 'updateMaterialSupplier', 'deactivateMaterialSupplier']) expect(service).toContain(operation);
    expect(service).not.toMatch(/from\('material_suppliers'\)[\s\S]*?\.delete\(/);
  });

  it('offers explicit linking from an unlinked purchase line without auto-creating it', () => {
    expect(app).toContain('Este material no está vinculado a');
    expect(app).toContain('Vincular material con este proveedor');
    expect(app).toContain('Guardar relación y continuar');
    expect(app).toContain("suppliersService.addMaterialSupplier(material.id, { supplier_id: order.supplier_id");
    expect(app).toContain('También puedes continuar como línea manual.');
    expect(app).toContain('purchaseOrdersService.addLine(order.id, values)');
    const lineForm = app.slice(app.indexOf('function PurchaseOrderLineForm'), app.indexOf('function PurchaseReceiptForm'));
    expect(lineForm).not.toContain('addMaterialSupplier');
  });

  it('keeps supplier price as an initial value and purchase line price as its snapshot', () => {
    expect(app).toContain('Precio habitual:');
    expect(app).toContain('Precio acordado');
    expect(purchaseService).toContain('p_unit_purchase_price');
    expect(relationMigration).toContain('purchase_unit_price numeric(12,2)');
    expect(readFileSync(new URL('../../supabase/migrations/119_purchase_orders.sql', import.meta.url), 'utf8')).toContain('unit_purchase_price numeric(12,2)');
  });

  it('provides material supplier management and safe unlinking', () => {
    expect(app).toContain('function MaterialSuppliersEditor');
    expect(app).toContain('Añadir proveedor');
    expect(app).toContain('Editar relación');
    expect(app).toContain('Desvincular');
    expect(app).toContain('MaterialSuppliersEditor materialId={material.id}');
  });

  it('archives only cancelled or received orders and never physically deletes them', () => {
    expect(archiveMigration).toContain('add column if not exists archived_at timestamptz');
    expect(archiveMigration).toContain("v_order.status not in ('cancelled', 'received')");
    expect(archiveMigration).toContain('set archived_at = now()');
    expect(archiveMigration).not.toContain('v_order.deleted_at');
    expect(archiveMigration).not.toContain('set deleted_at');
    expect(archiveMigration).not.toMatch(/delete\s+from\s+public\.purchase_orders/i);
    expect(archiveMigration).toContain("public.has_permission('purchase_orders.update')");
    expect(archiveMigration).toContain('dmp_record_lifecycle_audit(v_order.company_id, v_actor, \'purchase_orders\', v_order.id, \'ARCHIVE\'');
    expect(archiveMigration).toContain("'ARCHIVE'");
    expect(purchaseService).toContain('archive(id: string');
    expect(purchaseService).toContain('archiveFilter');
    expect(purchaseService).toContain("query.is('archived_at', null)");
    expect(purchaseService).toContain("query.not('archived_at', 'is', null)");
    expect(app).toContain('Todos activos');
    expect(app).toContain('Archivados');
    expect(app).toContain('<th>Acciones</th>');
    expect(app).toContain('onClick={() => setSelectedId(order.id)}>Abrir</button>');
    expect(app).toContain('Boolean(order.archived_at)');
  });

  it('verifies the archive contract structurally and read-only', async () => {
    const parser = await pgQuery();
    expect(parser.parse(archiveMigration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(archiveVerification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(archiveVerification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    for (const value of ['archived_at', 'to_regprocedure', 'SECURITY DEFINER', 'search_path=public', 'aclexplode', 'current_company_id', 'current_profile_id', 'purchase_orders[.]update', 'cancelled', 'received', 'dmp_record_lifecycle_audit', 'already-archived']) expect(archiveVerification).toContain(value);
    expect(archiveVerification).not.toContain('regexp_replace');
    expect(archiveVerification).toContain('physical or historical delete present');
  });
});
