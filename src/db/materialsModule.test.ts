import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const materialsService = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const quotesService = readFileSync(new URL('../services/quotesService.ts', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const initialSchema = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8');
const autoCodes = readFileSync(new URL('../../supabase/migrations/004_auto_codes_core_entities.sql', import.meta.url), 'utf8');

describe('materials module', () => {
  it('reuses the real materials table and MAT automatic code', () => {
    expect(initialSchema).toContain('create table public.materials');
    for (const column of ['company_id', 'code', 'description', 'manufacturer', 'reference', 'unit', 'cost', 'price', 'minimum_stock', 'active', 'deleted_at']) expect(initialSchema).toContain(column);
    expect(autoCodes).toContain("new.code := public.next_dmp_code(new.company_id, TG_TABLE_NAME, 'MAT', false, 6)");
    expect(materialsService).toContain("codesService.next('materials', 'MAT', false, 6, company_id)");
  });

  it('exposes materials to requested roles without granting technician module access', () => {
    for (const nav of ['const sat =', 'const comercial =', 'const oficina =', 'const gerencia =', 'const superadmin =']) expect(app).toContain(nav);
    expect(app).toContain("id: 'materiales', label: 'Materiales', path: '/app/modulos/materiales'");
    expect(permissions).toContain("path.startsWith('/app/modulos/materiales')");
    expect(permissions).toContain("['superadmin', 'SAT', 'Gerencia', 'Comercial', 'Oficina']");
  });

  it('implements list create edit search and deactivate UI', () => {
    expect(app).toContain('function MaterialsModule');
    expect(app).toContain('function MaterialForm');
    expect(app).toContain('materialsService.list(search, scope)');
    expect(app).toContain('materialsService.create(values)');
    expect(app).toContain('materialsService.update(initial.id, values)');
    expect(app).toContain('materialsService.deactivate(removing.id)');
    expect(app).toContain('Desactivar material');
    expect(materialsService).toContain("contains(['code', 'description', 'manufacturer', 'reference', 'unit'], search)");
  });

  it('connects catalog materials to quotes and work orders while keeping manual material fallback', () => {
    expect(quotesService).toContain("select('id, code, description, manufacturer, reference, unit, cost, price')");
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
