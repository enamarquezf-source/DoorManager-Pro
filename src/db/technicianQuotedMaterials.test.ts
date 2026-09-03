import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const submitMigration = readFileSync(new URL('../../supabase/migrations/094_canonical_stock_deferred_consumption.sql', import.meta.url), 'utf8');
const decisionMigration = readFileSync(new URL('../../supabase/migrations/046_work_order_planned_material_decisions.sql', import.meta.url), 'utf8');
const technicalMigration = readFileSync(new URL('../../supabase/migrations/083_technical_planned_concept_resolution.sql', import.meta.url), 'utf8');

describe('technician materials from associated quotes', () => {
  it('shows quoted material lines in the technician operational flow', () => {
    expect(app).toContain('MATERIALES PREVISTOS DEL PRESUPUESTO');
    expect(app).toContain('<PlannedMaterialList workOrder={data} onChanged={reload} />');
    expect(app).toContain("line.line_type !== 'material' && !line.material_id");
  });

  it('creates a usage row and preserves quote-line traceability', () => {
    expect(app).toContain('const materialUsageId = await workOrdersService.upsertMaterial');
    expect(app).toContain('work_order_material_id: materialUsageId');
    expect(app).toContain('quote_line_id: line.id');
    expect(service).toContain("supabase.rpc('dmp_submit_work_order_material'");
    expect(service).toContain("supabase.rpc('dmp_set_work_order_planned_material_decision'");
    expect(decisionMigration).toContain('work_order_material_id uuid references public.work_order_materials(id)');
  });

  it('keeps technical material registration free of economic controls', () => {
    const form = app.slice(app.indexOf('function PlannedMaterialUseForm'), app.indexOf('function PlannedQuoteConceptsCard'));
    expect(form).not.toContain('unit_price');
    expect(form).toContain('warehouse_id: warehouseId');
    expect(app).toContain('canViewWorkOrderCosts(profile)');
    expect(app).toContain('canManageWorkOrderCosts(profile, workOrder)');
    expect(technicalMigration).toContain("if v_line.line_type in ('material','labor','fee','discount') then raise exception");
  });

  it('keeps stock validation deferred and prevents duplicate consumption', () => {
    expect(submitMigration).toContain("case when v_material_id is not null and coalesce(v_material.stock_controlled, true) then 'pending' else 'validated' end");
    expect(submitMigration).toContain("if not public.has_any_role(array['superadmin','SAT','Gerencia','Oficina']) then raise exception 'permiso: solo backoffice puede validar consumos'");
    expect(submitMigration).toContain('stock_movements_work_order_material_once');
    expect(submitMigration).toContain('stock_movements_company_idempotency_key');
  });

  it('keeps manual materials on the existing technician path', () => {
    expect(app).toContain('Material no catalogado');
    expect(app).toContain('description: line.material_id ? \'\' : line.description');
    expect(service).toContain('syncOfflineMaterial');
  });
});
