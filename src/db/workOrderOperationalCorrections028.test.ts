import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/028_work_order_operational_corrections.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

describe('work order operational corrections 028', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('creates an audited RPC for partial operational corrections', () => {
    expect(migration).toContain('create or replace function public.dmp_update_work_order_operational_fields');
    expect(migration).toContain('public.dmp_active_profile()');
    expect(migration).toContain('public.dmp_assert_work_order_operator(p_work_order_id, false)');
    expect(migration).toContain("case when p_payload ? 'diagnosis'");
    expect(migration).toContain("case when p_payload ? 'work_performed'");
    expect(migration).toContain("case when p_payload ? 'result'");
    expect(migration).toContain("case when p_payload ? 'planned_material'");
    expect(migration).toContain('updated_by = v_profile.id');
    expect(migration).toContain("'OPERATIONAL_UPDATE'");
    expect(migration).toContain('insert into public.audit_log');
  });

  it('exposes the RPC only to authenticated users', () => {
    expect(migration).toContain('revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from public');
    expect(migration).toContain('revoke all on function public.dmp_update_work_order_operational_fields(uuid, jsonb) from anon');
    expect(migration).toContain('grant execute on function public.dmp_update_work_order_operational_fields(uuid, jsonb) to authenticated');
  });

  it('connects UI and service without sending administrative fields', () => {
    expect(service).toContain('workOrderOperationalColumns');
    expect(service).toContain('dmp_update_work_order_operational_fields');
    expect(service).not.toContain('updateOperationalFields(id: string, payload: Record<string, any>) {\n    return expectData<any>(supabase.from');
    expect(permissions).toContain('canCorrectWorkOrderOperationalFields');
    expect(app).toContain('WorkOrderOperationalCard');
    expect(app).toContain('Revisión/corrección de oficina');
    expect(app).toContain('Guardar cambios operativos');
  });
});
