import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/045_finalize_work_order_technical.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('045 technical work order finalization', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('creates a scoped finalize RPC without stock consumption side effects', () => {
    expect(migration).toContain('create or replace function public.dmp_finalize_work_order_technical');
    expect(migration).toContain('public.assert_member_of_current_company(v_work.company_id)');
    expect(migration).toContain("economic_status = v_economic_status");
    expect(migration).toContain("'pendiente_facturar'");
    expect(migration).toContain("'garantia'");
    expect(migration).toContain("'no_facturable'");
    expect(migration).toContain('real_cost_amount = v_real_cost');
    expect(migration).toContain('estimated_margin_amount');
    expect(migration).toContain('work_order_status_history');
    expect(migration).toContain("status = 'Ejecutado en cliente'");
    expect(migration).not.toContain('dmp_apply_material_stock_movement');
    expect(migration).not.toContain('service_role');
    expect(migration).not.toContain('disable row level security');
  });

  it('routes technical finalization through the dedicated RPC from the frontend service', () => {
    expect(service).toContain('finalizeTechnical');
    expect(service).toContain("status === 'Finalizado tecnicamente'");
    expect(service).toContain("dmp_finalize_work_order_technical");
  });
});
