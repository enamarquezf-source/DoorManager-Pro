import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration046 = readFileSync(new URL('../../supabase/migrations/046_work_order_planned_material_decisions.sql', import.meta.url), 'utf8');
const migration045 = readFileSync(new URL('../../supabase/migrations/045_finalize_work_order_technical.sql', import.meta.url), 'utf8');
const stockMigration = readFileSync(new URL('../../supabase/migrations/035_material_stock_control.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('046 planned materials and technical closeout UX', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration046).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('keeps structured planned material decisions separate from stock', () => {
    expect(migration046).toContain('create table if not exists public.work_order_planned_material_decisions');
    expect(migration046).toContain("decision in ('utilizado','no_utilizado')");
    expect(migration046).toContain('quote_line_id uuid not null references public.quote_lines(id)');
    expect(migration046).toContain('work_order_material_id uuid references public.work_order_materials(id)');
    expect(migration046).toContain('dmp_set_work_order_planned_material_decision');
    expect(migration046).not.toContain('dmp_apply_material_stock_movement');
    expect(migration046).not.toContain('service_role');
  });

  it('loads quote lines as planned materials instead of guessing from planned_material text', () => {
    expect(service).toContain("supabase.from('quote_lines')");
    expect(service).toContain('planned_material_lines');
    expect(service).toContain('work_order_planned_material_decisions');
    expect(app).toContain('Sin materiales previstos. Material indicado');
    expect(app).not.toContain('lower(description) = lower');
  });

  it('exposes finalization to allowed roles through a summary modal and blocks double click', () => {
    expect(app).toContain('FINALIZAR PARTE TÉCNICO');
    expect(app).toContain("['superadmin','SAT','Gerencia']");
    expect(app).toContain("roles.includes('Tecnico')");
    expect(app).toContain("!['Finalizado tecnicamente','Enviado','Cerrado','Cancelado'].includes");
    expect(app).toContain('WorkOrderFinalizeModal');
    expect(app).toContain('if (saving) return');
    expect(app).toContain('workOrdersService.finalizeTechnical');
    expect(app).toContain('Hay {pending.length} concepto(s) operativo(s) previsto(s) sin confirmar');
  });

  it('shows all closeout summary sections before finalizing', () => {
    for (const text of ['TRABAJO', 'HORAS', 'MATERIALES PREVISTOS', 'MATERIALES UTILIZADOS', 'OTROS COSTES', 'Diagnóstico', 'Trabajo realizado', 'Resultado', 'Observaciones', 'Desplazamiento', 'Taller móvil', 'Plataformas', 'Otros']) expect(app).toContain(text);
  });

  it('supports planned to used, unused, and additional material flows', () => {
    expect(app).toContain('Marcar como utilizado');
    expect(app).toContain('No utilizado');
    expect(app).toContain('PlannedMaterialUseForm');
    expect(app).toContain('workOrdersService.upsertMaterial');
    expect(app).toContain('workOrdersService.setPlannedMaterialDecision');
    expect(app).toContain("decision: 'utilizado'");
    expect(app).toContain("decision: 'no_utilizado'");
    expect(app).toContain('Añadir material');
  });

  it('documents stock behavior across planned, used, finalization and double finalization', () => {
    expect(stockMigration).toContain("public.dmp_apply_material_stock_movement(v_material, 'out', v_quantity");
    expect(stockMigration).toContain('stock_deducted_quantity');
    expect(migration046).not.toContain("'out'");
    expect(migration045).not.toContain('dmp_apply_material_stock_movement');
    expect(migration045).not.toContain('stock_deducted_quantity');
    expect(app).toContain('Finalizar prepara el parte para facturación, pero no vuelve a descontar stock');
  });

  it('shows resulting operational and economic status labels', () => {
    expect(app).toContain('FINALIZADO TÉCNICAMENTE');
    expect(app).toContain('PENDIENTE DE FACTURACIÓN');
    expect(app).toContain('GARANTÍA');
    expect(app).toContain('NO FACTURABLE');
    expect(migration045).toContain("status = 'Ejecutado en cliente'");
  });

  it('prevents vertical text in time cards with scoped CSS only', () => {
    expect(app).toContain('work-time-list');
    expect(css).toContain('.work-time-list article p, .work-time-list article strong');
    expect(css).toContain('word-break: normal');
    expect(css).toContain('white-space: normal');
    expect(css).toContain('.work-time-list article { grid-template-columns: minmax(0, 1fr);');
  });
});
