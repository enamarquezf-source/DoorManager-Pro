import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const economicService = readFileSync(new URL('../services/economicService.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const migration058 = readFileSync(new URL('../../supabase/migrations/058_fix_work_order_material_economics.sql', import.meta.url), 'utf8');

const cardStart = app.indexOf('function WorkOrderMaterialsCard');
expect(cardStart).toBeGreaterThan(-1);
const cardBlock = app.slice(cardStart, app.indexOf('function WorkOrderTimeForm', cardStart));

describe('WorkOrderMaterialsCard: presentacion economica de materiales', () => {
  it('resume el coste real por suma de total_cost, sin la venta como unico dato', () => {
    expect(cardBlock).toContain('const materialCost = rows.reduce((sum: number, row: any) => sum + Number(row.total_cost ?? (row.used_quantity ?? 0) * (row.unit_cost ?? 0)), 0)');
    expect(cardBlock).toContain('Coste real materiales: {money(materialCost)}');
    expect(cardBlock).not.toContain('Total económico');
    expect(cardBlock).not.toContain('amount.toFixed(2)');
  });

  it('muestra la venta registrada en el resumen solo si es mayor que cero', () => {
    expect(cardBlock).toContain('const materialSale = rows.reduce((sum: number, row: any) => sum + Number(row.total_price ?? (row.used_quantity ?? 0) * (row.unit_price ?? 0)), 0)');
    expect(cardBlock).toContain('materialSale > 0 && <span className="large-note">Venta registrada: {money(materialSale)}</span>');
  });

  it('muestra coste usado y coste total cuando unit_cost es mayor que cero', () => {
    expect(cardBlock).toContain('Coste usado: {money(row.unit_cost)}/{row.unit ?? \'ud\'} · Coste total: {money(row.total_cost ?? (row.used_quantity ?? 0) * (row.unit_cost ?? 0))}');
  });

  it('no presenta un unit_price inexistente como "Precio usado: 0"', () => {
    expect(cardBlock).not.toContain('Precio usado');
    expect(cardBlock).toContain('Precio de venta histórico: no registrado');
  });

  it('no inventa la venta historica desde el catalogo (materials.price/cost)', () => {
    expect(cardBlock).not.toContain('materials?.price');
    expect(cardBlock).not.toContain('materials?.cost');
    expect(cardBlock).not.toContain('.materials.price');
    expect(cardBlock).not.toContain('.materials.cost');
  });

  it('muestra "Sin coste/venta registrada" para material manual sin valoracion', () => {
    expect(cardBlock).toContain('Sin coste/venta registrada');
  });

  it('mantiene el stock descontado visible e independiente de lo economico', () => {
    expect(cardBlock).toContain('Stock descontado: {Number(row.stock_deducted_quantity ?? 0).toLocaleString(\'es-ES\')} {row.unit ?? \'ud\'}');
    expect(cardBlock).toContain('Unidades: {units}');
  });

  it('no recalcula coste desde catalogo ni consulta el backend desde la tarjeta', () => {
    expect(cardBlock).not.toContain('supabase');
    expect(cardBlock).not.toContain('.rpc(');
  });

  it('es un cambio solo de presentacion: no toca SQL ni servicios economicos', () => {
    expect(service).toContain("from('work_order_materials').select('*, materials!work_order_materials_material_id_fkey(*), profiles!work_order_materials_registered_by_fkey(first_name,last_name,primary_area)')");
    expect(economicService).toContain('v_work_order_economic_summary');
    expect(migration058).toContain('raise notice \'dmp_058: work_order_materials reparados=% ; partes afectados=% ; filas ambiguas sin reparar=%\'');
  });

  it('respeta la politica de rol: coste interno solo para roles economicos, nunca Tecnico', () => {
    expect(cardBlock).toContain('const showCosts = canViewWorkOrderCosts(profile)');
    expect(cardBlock).toContain('{showCosts && <span className="large-note">Coste real materiales');
    expect(cardBlock).toContain('{showCosts && <p className="material-money">');
    expect(permissions).toContain('const economicRoles: RoleName[] = [\'superadmin\', \'SAT\', \'Comercial\', \'Gerencia\', \'Oficina\'];');
    expect(permissions).toContain('export function canViewWorkOrderCosts(profile: Profile | null | undefined) { return canViewInternalEconomics(profile); }');
  });
});