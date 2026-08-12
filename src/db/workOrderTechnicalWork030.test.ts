import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/030_real_technical_work_current_fields.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf('\ncreate or replace function public.', start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe('real technical work current fields 030', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('declara observations como campo actual del parte', () => {
    expect(migration).toContain('alter table public.work_orders add column if not exists observations text');
    expect(service).toContain("'observations'");
    expect(app).toContain('[ \'Observaciones\', summary.observations ?? \'-\' ]');
  });

  it('convierte la nota tecnica del tecnico en valores actuales editables', () => {
    const syncBody = functionBody(migration, 'sync_work_order_note');

    expect(syncBody).toContain('insert into public.work_order_notes');
    expect(syncBody).toContain('diagnosis = coalesce(v_diagnosis, diagnosis)');
    expect(syncBody).toContain('work_performed = coalesce(v_work_performed, work_performed)');
    expect(syncBody).toContain('result = coalesce(v_result, result)');
    expect(syncBody).toContain('observations = coalesce(v_observations, observations)');
  });

  it('permite a SAT Oficina Gerencia y superadmin corregir la fuente actual', () => {
    const rpcBody = functionBody(migration, 'dmp_update_work_order_operational_fields');

    expect(rpcBody).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(rpcBody).toContain("public.has_any_role(array['Tecnico']) and public.is_assigned_to_work_order");
    expect(rpcBody).toContain('public.assert_member_of_current_company(v_work.company_id)');
    expect(rpcBody).toContain('estado editable: el parte esta % y no permite correccion operativa');
  });

  it('actualiza solo los campos presentes y audita la operacion', () => {
    const rpcBody = functionBody(migration, 'dmp_update_work_order_operational_fields');

    for (const field of ['description', 'diagnosis', 'work_performed', 'result', 'observations', 'planned_material']) {
      expect(rpcBody).toContain(`case when p_payload ? '${field}'`);
      expect(rpcBody).toContain(`jsonb_build_object('${field}'`);
    }
    expect(rpcBody).toContain("'OPERATIONAL_UPDATE'");
    expect(rpcBody).toContain('insert into public.audit_log');
    expect(rpcBody).toContain('insert into public.work_order_notes');
  });

  it('usa la firma RPC consumida por frontend', () => {
    expect(migration).toContain('create or replace function public.dmp_update_work_order_operational_fields(p_work_order_id uuid, p_payload jsonb)');
    expect(service).toContain('const params = { p_work_order_id: id, p_payload: operationalPayload }');
    expect(service).toContain("supabase.rpc('dmp_update_work_order_operational_fields', params)");
  });
});
