import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/047_work_order_planned_quote_lines.sql', import.meta.url), 'utf8');
const finalizeMigration = readFileSync(new URL('../../supabase/migrations/045_finalize_work_order_technical.sql', import.meta.url), 'utf8');
const materialMigration = readFileSync(new URL('../../supabase/migrations/035_material_stock_control.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('047 planned quote lines to real execution', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps quote_line traceability for real cost entries and decisions', () => {
    expect(migration).toContain('alter table public.work_order_cost_entries add column if not exists quote_line_id');
    expect(migration).toContain('create table if not exists public.work_order_quote_line_decisions');
    expect(migration).toContain('quote_line_id uuid not null references public.quote_lines(id)');
    expect(migration).toContain('work_order_cost_entry_id uuid references public.work_order_cost_entries(id)');
    expect(migration).toContain('work_order_cost_entries_quote_line_unique');
    expect(migration).toContain('company_id = public.current_company_id() or public.is_platform_superadmin()');
    expect(migration).not.toContain('service_role');
  });

  it('maps operational quote line types to existing work order cost types', () => {
    for (const [lineType, costType] of [['transport', 'desplazamiento'], ['travel', 'desplazamiento'], ['mobile_workshop', 'taller_movil'], ['lifting_platform', 'plataforma_elevadora'], ['auxiliary_equipment', 'medio_auxiliar'], ['external_cost', 'coste_externo'], ['other', 'otro']]) {
      expect(migration).toContain(`when '${lineType}' then '${costType}'`);
    }
  });

  it('does not convert labor, fee, discount or material through the generic cost RPC', () => {
    expect(migration).toContain("v_line.line_type in ('material','labor','fee','discount')");
    expect(app).toContain('La mano de obra prevista no crea horas');
    expect(app).toContain('Concepto comercial sin coste operativo asociado');
    expect(service).toContain('planned_material_lines');
  });

  it('confirms, modifies and marks not-realized concepts idempotently', () => {
    expect(migration).toContain('dmp_set_work_order_quote_line_decision');
    expect(migration).toContain('on conflict (company_id, work_order_id, quote_line_id)');
    expect(migration).toContain('set cost_type = excluded.cost_type');
    expect(migration).toContain('quantity = v_quantity');
    expect(migration).toContain("decision in ('confirmado','no_realizado')");
    expect(migration).toContain('deleted_at = now()');
  });

  it('loads all planned quote lines and decisions in the work order service', () => {
    expect(service).toContain('planned_quote_lines');
    expect(service).toContain('planned_quote_line_decisions');
    expect(service).toContain("supabase.from('quote_lines')");
    expect(service).toContain("supabase.from('work_order_quote_line_decisions')");
    expect(service).toContain('setPlannedQuoteLineDecision');
  });

  it('shows all planned concept categories and expected actions in the work order UI', () => {
    for (const text of ['CONCEPTOS PREVISTOS DEL PRESUPUESTO', 'MATERIALES PREVISTOS', 'MANO DE OBRA PREVISTA', 'DESPLAZAMIENTOS', 'TALLER MÓVIL', 'PLATAFORMA / MEDIOS AUXILIARES', 'COSTES EXTERNOS / OTROS', 'Confirmar concepto previsto', 'Modificar cantidad', 'No realizado']) expect(app).toContain(text);
  });

  it('shows the canonical SQL economic snapshot at technical close', () => {
    expect(app).toContain('ECONOMÍA CANÓNICA');
    expect(app).toContain('Venta presupuestada');
    expect(app).toContain('Venta adicional');
    expect(app).toContain('Venta total');
    expect(app).toContain('Coste real');
    expect(app).toContain('Margen');
    expect(app).not.toContain('quoteSale - materialCost - timeCost - auxCost');
  });

  it('keeps stock and finalization behavior unchanged', () => {
    expect(materialMigration).toContain("public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity");
    expect(migration).not.toContain('dmp_apply_material_stock_movement');
    expect(finalizeMigration).not.toContain('dmp_apply_material_stock_movement');
    expect(finalizeMigration).toContain('v_real_cost := round(coalesce(v_material_cost, 0) + coalesce(v_time_cost, 0) + coalesce(v_aux_cost, 0), 2)');
  });
});
