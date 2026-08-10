import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/029_work_order_time_assignment_intervention_fix.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf('\ncreate or replace function public.', start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe('work order time assignment intervention 029', () => {
  it('parses migration SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('permite horas sin descripcion obligatoria', () => {
    const upsertBody = functionBody(migration, 'dmp_upsert_work_order_time_entry');
    expect(migration).toContain('v_description text := trim(coalesce');
    expect(upsertBody).toContain('description = v_description');
    expect(upsertBody).not.toContain('describe el trabajo realizado');
    expect(upsertBody).not.toContain("trim(coalesce(p_payload->>'description', '')) = ''");
  });

  it('mantiene descripcion de horas opcional en el formulario', () => {
    const formBlock = app.slice(app.indexOf('function WorkOrderTimeForm'), app.indexOf('function WorkOrderMaterialForm'));
    const descriptionField = formBlock.slice(formBlock.indexOf('Descripción del trabajo'), formBlock.indexOf('{error &&', formBlock.indexOf('Descripción del trabajo')));

    expect(descriptionField).toContain('textarea');
    expect(descriptionField).not.toContain('required');
    expect(formBlock).not.toContain('describe el trabajo realizado');
    expect(formBlock).not.toContain('!values.description?.trim()');
  });

  it('autoriza a SAT Oficina Gerencia y superadmin a registrar horas sin exigir asignacion propia', () => {
    const assertBody = functionBody(migration, 'dmp025_assert_time_target');
    const optionsBody = functionBody(migration, 'dmp_work_order_time_worker_options');

    expect(assertBody).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(optionsBody).toContain("array['superadmin','SAT','Gerencia','Oficina']");
    expect(assertBody).toContain('if v_admin then return v_work; end if;');
  });

  it('sincroniza la fecha visible del parte con la asignacion tecnica', () => {
    expect(migration).toContain('create or replace function public.assign_technician');
    expect(migration).toContain('create or replace function public.manage_work_order_assignments');
    expect(migration).toContain('scheduled_date = p_assignment_date');
    expect(migration).toContain('scheduled_time = p_start');
  });

  it('guarda observaciones operativas reales en notas tecnicas auditadas', () => {
    expect(migration).toContain("p_payload ? 'observations'");
    expect(migration).toContain('insert into public.work_order_notes');
    expect(migration).toContain("'Observaciones: ' || v_observations");
    expect(migration).toContain("'OPERATIONAL_UPDATE'");
  });

  it('expone las RPC solo a usuarios autenticados', () => {
    expect(migration).toContain('grant execute on function public.dmp_upsert_work_order_time_entry(jsonb) to authenticated');
    expect(migration).toContain('grant execute on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) to authenticated');
    expect(migration).toContain('grant execute on function public.manage_work_order_assignments(uuid, uuid, uuid[], uuid, date, time, time, uuid, text) to authenticated');
    expect(migration).toContain('grant execute on function public.dmp_update_work_order_operational_fields(uuid, jsonb) to authenticated');
  });
});
