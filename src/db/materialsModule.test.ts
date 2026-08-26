import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const initialSchema = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8');
const stockBoundary = readFileSync(new URL('../../supabase/migrations/075_material_stock_write_boundary.sql', import.meta.url), 'utf8');

describe('materials module', () => {
  it('reuses the real materials table and server-side stock creation', () => {
    expect(initialSchema).toContain('create table public.materials');
    for (const column of ['company_id', 'code', 'description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'minimum_stock', 'active', 'deleted_at']) expect(initialSchema).toContain(column);
    for (const column of ['stock_quantity', 'stock_controlled', 'allow_negative_stock']) expect(materialsService).toContain(column);
    expect(materialsService).toContain("supabase.rpc('dmp_create_material_with_stock'");
    expect(materialsService).not.toContain("codesService.next('materials'");
    expect(stockBoundary).toContain('Stock inicial al crear material');
  });

  it('exposes materials to requested roles without granting technician module access', () => {
    for (const nav of ['const sat =', 'const comercial =', 'const oficina =', 'const gerencia =', 'const superadmin =']) expect(app).toContain(nav);
    expect(app).toContain("id: 'materiales', label: 'Materiales', path: '/app/modulos/materiales'");
    expect(permissions).toContain("path.startsWith('/app/modulos/materiales')");
    expect(permissions).toContain('economicRoles');
  });

  it('implements list create edit search and deactivate UI', () => {
    expect(app).toContain('function MaterialsModule');
    expect(app).toContain('function MaterialForm');
    expect(app).toContain('materialsService.list(search, scope, archiveFilter)');
    expect(app).toContain('materialsService.create(values)');
    expect(app).toContain('materialsService.update(initial.id, values)');
    expect(app).toContain("entityLifecycleService.archive('materials', removing.id, reason)");
    expect(app).toContain('Desactivar material');
    expect(app).toContain('Ajustar stock');
    expect(app).toContain('Ver movimientos');
    expect(materialsService).toContain("contains(['code', 'description', 'manufacturer', 'reference', 'unit'], search)");
  });

  it('connects catalog materials to quotes and work orders while keeping manual material fallback', () => {
    expect(quotesService).toContain('stock_quantity');
    expect(workOrdersService).toContain("contains(['code', 'description', 'manufacturer', 'reference'], search)");
    expect(app).toContain('Material manual / sin catálogo');
    expect(app).toContain('Material no catalogado');
    expect(app).toContain('unit_cost: material?.cost');
    expect(app).toContain('unit_price: material?.price');
  });

  it('does not add security definer views or service role usage', () => {
    expect(materialsService.toLowerCase()).not.toContain('security definer');
    expect(materialsService).not.toContain('service_role');
  });
});
