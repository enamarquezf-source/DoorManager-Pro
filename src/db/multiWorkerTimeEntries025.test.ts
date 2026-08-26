import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/025_multi_worker_time_entries.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_multi_worker_time_entries_025.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_multi_worker_time_entries_025.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf('\ncreate or replace function public.', start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe('multi worker time entries 025', () => {
  it('parses migration and verification SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('validates worker selection by role in Supabase', () => {
    const assertBody = functionBody(migration, 'dmp025_assert_time_target');
    expect(assertBody).toContain('dmp025_actor_profile');
    expect(assertBody).toContain('v_target.company_id is distinct from v_work.company_id');
    expect(assertBody).toContain("v_work.status in ('Cerrado','Cancelado')");
    expect(assertBody).toContain('not public.dmp025_has_active_assignment(v_work.id, v_actor.id)');
    expect(assertBody).toContain('not public.dmp025_has_active_assignment(v_work.id, v_target.id)');
    expect(assertBody).toContain('dmp025_can_commercial_operate');
    expect(assertBody).toContain('Comercial solo puede registrar horas de personas asignadas activamente');
  });

  it('stores target profile and actor audit separately on insert and edit', () => {
    const upsertBody = functionBody(migration, 'dmp_upsert_work_order_time_entry');
    expect(migration).toContain('add column if not exists updated_by');
    expect(upsertBody).toContain('v_profile_id uuid := coalesce');
    expect(upsertBody).toContain('profile_id = v_profile_id');
    expect(upsertBody).toContain('updated_by = v_actor.id');
    expect(upsertBody).toContain('created_by, updated_by');
    expect(upsertBody).toContain('v_existing.created_by = v_actor.id');
    const deleteBody = functionBody(migration, 'dmp_delete_work_order_time_entry');
    expect(deleteBody).toContain('dmp025_assert_time_target');
    expect(deleteBody).toContain('v_entry.created_by = v_actor.id');
    expect(deleteBody).toContain('audit_log');
  });

  it('exposes only authenticated public RPCs and keeps helper RPCs private', () => {
    expect(migration).toContain('grant execute on function public.dmp_work_order_time_worker_options(uuid) to authenticated');
    expect(migration).toContain('grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated');
    expect(migration).toContain('grant execute on function public.dmp_delete_work_order_time_entry(uuid, text) to authenticated');
    expect(migration).toContain('revoke all on function public.dmp025_assert_time_target(uuid, uuid) from authenticated');
    expect(migration).toContain('revoke all on function public.dmp025_actor_profile() from public');
    expect(migration).not.toContain('drop view cascade');
  });

  it('updates frontend to select and submit profile_id with grouped totals and audit labels', () => {
    const formBlock = app.slice(app.indexOf('function WorkOrderTimeForm'), app.indexOf('function WorkOrderMaterialForm'));
    const cardBlock = app.slice(app.indexOf('function WorkOrderTimeCard'), app.indexOf('function WorkOrderMaterialsCard'));
    expect(formBlock).toContain('trabajador al que corresponden las horas');
    expect(formBlock).toContain('profile_id');
    expect(formBlock).toContain('timeWorkerOptions');
    expect(formBlock).toContain('Duración calculada');
    expect(cardBlock).toContain('Total general');
    expect(cardBlock).toContain('Horas de');
    expect(cardBlock).toContain('Registrado por');
    expect(cardBlock).toContain('Actualizado por');
    expect(service).toContain('dmp_work_order_time_worker_options');
    expect(service).toContain('created_by_profile');
    expect(service).toContain('updated_by_profile');
  });

  it('documents required functional cases in rollback verification', () => {
    for (const phrase of ['Técnico A asignado registra sus propias horas', 'Técnico A registra horas para Técnico B asignado', 'persona no asignada, inactiva, eliminada u otra empresa']) {
      expect(verification).toContain(phrase);
    }
  });
});
