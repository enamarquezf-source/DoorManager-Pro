import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/048_fix_finalize_and_installation_flow.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const equipmentService = readFileSync(new URL('../services/equipmentService.ts', import.meta.url), 'utf8');

describe('048 finalize fix and installation flow', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('allows the technical finalize audit operation without changing stock rules', () => {
    expect(migration).toContain("'TECHNICAL_FINALIZE'");
    expect(migration).toContain('audit_log_operation_check');
    expect(migration).not.toContain('dmp_apply_material_stock_movement');
    expect(migration).not.toContain('insert into public.work_order_materials');
    expect(migration).not.toContain('service_role');
    expect(migration).not.toContain('disable row level security');
  });

  it('creates installation equipment and check only inside create_work_order_full', () => {
    expect(migration).toContain("p_payload->'installation_equipment'");
    expect(migration).toContain("coalesce(nullif(p_payload->>'type', ''), 'Correctivo') = 'Instalacion'");
    expect(migration).toContain('insert into public.equipment');
    expect(migration).toContain('insert into public.work_orders');
    expect(migration).toContain('insert into public.checks');
    expect(migration).toContain("lower(name) like '%instal%'");
    expect(migration).toContain("lower(name) like '%puesta en marcha%'");
    expect(migration).toContain('no existe una plantilla activa de check de instalacion');
  });

  it('keeps company scope and quote validation in the replaced RPC', () => {
    expect(migration).toContain('if not public.is_platform_superadmin() then perform public.assert_member_of_current_company(v_company_id); end if;');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Comercial','Gerencia','Oficina'])");
    expect(migration).toContain('v_quote.company_id <> v_company_id or v_quote.client_id <> v_client_id');
    expect(migration).toContain('v_quote.site_id is not null and v_quote.site_id is distinct from v_site_id');
    expect(migration).toContain('v_quote.equipment_id is not null and v_quote.equipment_id is distinct from v_equipment_id');
  });

  it('exposes useful frontend errors and installation equipment payload', () => {
    expect(app).toContain('Equipo nuevo de instalación');
    expect(app).toContain('installation_equipment');
    expect(app).toContain('falta tipo de equipo para el parte de instalacion');
    expect(workOrdersService).toContain('DMP finalize technical work order failed');
    expect(workOrdersService).toContain('currentStatus');
    expect(equipmentService).toContain('company_id.eq.${companyId},company_id.is.null');
  });
});
