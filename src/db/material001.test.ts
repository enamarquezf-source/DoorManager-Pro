import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/122_material_flags.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_122_material_flags.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/materialsService.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const createRpc = migration.slice(migration.indexOf('create or replace function public.dmp_create_material_with_stock'), migration.indexOf('commit;'));

describe('MATERIAL-001', () => {
  it('persists independent material characteristics', () => {
    expect(migration).toContain('made_to_measure boolean not null default false');
    expect(migration).toContain('single_use boolean not null default false');
    expect(migration).toContain('made_to_measure,single_use');
    expect(migration).not.toContain('is_specific = made_to_measure');
    expect(migration).toContain('begin;');
    expect(verification).toContain('pg_attribute');
    expect(service).toContain("'made_to_measure'");
    expect(service).toContain("'single_use'");
  });

  it('separates master-data editing from canonical stock', () => {
    expect(app).toContain('MaterialMasterForm');
    expect(app).toContain('Editar material');
    expect(app).toContain('Ajustar stock');
    expect(app).toContain('Ficha de material');
    expect(service).toContain("supabase.rpc('dmp_adjust_warehouse_stock'");
    expect(service).not.toMatch(/materials[^\n]*stock_quantity/i);
    expect(app).not.toMatch(/materials[^\n]*stock_quantity/i);
    expect(createRpc).toContain('perform public.dmp_adjust_warehouse_stock');
    expect(createRpc).not.toContain('insert into public.warehouse_stock');
    expect(createRpc).not.toContain('insert into public.stock_movements');
  });

  it('does not redefine the canonical stock boundary from migration 120', () => {
    expect(migration).not.toMatch(/create\s+or\s+replace\s+function\s+public\.dmp_adjust_warehouse_stock/i);
    expect(migration).toContain('perform public.dmp_adjust_warehouse_stock');
    expect(verification).toContain("to_regprocedure('public.dmp_adjust_warehouse_stock(uuid,uuid,text,numeric,text,text)')");
    expect(verification).toContain('v_existing\\.movement_type');
    expect(verification).toContain('v_existing\\.quantity');
    expect(verification).toContain('is_platform_superadmin');
    expect(verification).toContain('on\\s+conflict');
    expect(verification).toContain('allow_negative_stock');
    expect(verification).toContain('insert\\s+into\\s+public\\.stock_movements');
    expect(verification).toContain("a.grantee = 0 and a.privilege_type = 'EXECUTE'");
    expect(verification).not.toMatch(/has_function_privilege\(\s*'public'/i);
  });

  it('requires a warehouse only for positive initial stock', () => {
    expect(app).toContain('Number(values.initial_quantity) > 0 && !values.warehouse_id');
    expect(app).toContain('Cantidad inicial');
    expect(app).toContain('Selecciona un almacén');
    expect(app).toContain('made_to_measure');
    expect(app).toContain('single_use');
    expect(createRpc).toContain("if v_warehouse is null then raise exception 'stock: selecciona un almacen para el stock inicial'");
    expect(createRpc).not.toContain("code = 'ALM-CENTRAL'");
  });

  it('shows warehouses, suppliers and recent movements in the material detail', () => {
    expect(app).toContain('Existencias por almacén');
    expect(app).toContain('MaterialSuppliersEditor materialId={material.id}');
    expect(app).toContain('Movimientos recientes');
    expect(app).toContain('Bajo stock');
  });

  it('keeps the creation RPC atomic and explicitly secured', () => {
    expect(createRpc).toContain('begin');
    expect(createRpc).toContain('returning * into v_material');
    expect(createRpc).toContain('perform public.dmp_adjust_warehouse_stock');
    expect(verification).toContain('pg_attrdef');
    expect(verification).toContain('prosecdef');
    expect(verification).toContain('has_function_privilege');
    expect(verification).toContain('aclexplode');
    expect(verification).toContain('proconfig @> array[\'search_path=public\']');
    expect(migration.indexOf('revoke all on function public.dmp_create_material_with_stock(jsonb)')).toBeGreaterThan(migration.indexOf('create or replace function public.dmp_create_material_with_stock'));
  });
});
