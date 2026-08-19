import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/024_operational_assignment_and_time_materials_fix.sql', import.meta.url), 'utf8');
const initialMigration = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_operational_assignment_024.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_operational_assignment_024.sql', import.meta.url), 'utf8');
const workOrdersService = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const assignmentsService = readFileSync(new URL('../services/assignmentsService.ts', import.meta.url), 'utf8');
const queryService = readFileSync(new URL('../services/query.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

function viewSelectColumns(sql: string, viewName: string) {
  const viewStart = sql.indexOf(viewName);
  expect(viewStart).toBeGreaterThan(-1);
  const selectStart = sql.indexOf('select', viewStart);
  const fromStart = sql.indexOf('\nfrom ', selectStart);
  const select = sql.slice(selectStart + 'select'.length, fromStart);
  const columns: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of select) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { columns.push(current.trim()); current = ''; }
    else current += char;
  }
  if (current.trim()) columns.push(current.trim());
  return columns.map((column) => {
    const alias = column.match(/\s+as\s+([a-z_][a-z0-9_]*)\s*$/i)?.[1];
    if (alias) return alias;
    const plain = column.trim().split(/\s+/).at(-1) ?? column;
    return plain.split('.').at(-1) ?? plain;
  });
}

describe('operational assignment 024', () => {
  it('parses migration and verification SQL', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('fixes hours and materials permissions for SAT, Gerencia, superadmin, technician and commercial', () => {
    expect(migration).toContain('create or replace function public.dmp024_assert_work_order_operator');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain('perform public.assert_member_of_current_company(v_work.company_id)');
    expect(migration).toContain('public.is_platform_superadmin()');
    expect(migration).toContain('create policy work_order_time_entries_select_scoped');
    expect(migration).toContain("a.status not in ('Finalizado','Cancelado')");
    expect(migration).toContain("p_work.origin = 'Comercial'");
    expect(migration).toContain('p_work.created_by = p_profile.id or p_work.current_responsible_id = p_profile.id');
    expect(migration).toContain('perfil activo:');
    expect(migration).toContain('validacion del formulario:');
    expect(migration).toContain('empresa:');
    expect(migration).toContain('asignacion:');
  });

  it('validates time/material payloads and preserves useful RPC errors in frontend', () => {
    expect(migration).toContain('dmp024_work_minutes');
    expect(migration).toContain('la pausa debe ser menor que la duracion total');
    expect(migration).toContain('describe el trabajo realizado');
    expect(migration).toContain('indica material de catalogo o descripcion no catalogada');
    expect(workOrdersService).toContain('Guardar horas del parte');
    expect(workOrdersService).toContain('Guardar material del parte');
    expect(queryService).toContain('No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.');
    expect(queryService).toContain('validacion del formulario|purga|permiso|perfil activo|empresa|asignacion|parte|estado editable|insercion');
    expect(app).toContain('validacion del formulario: indica inicio y fin');
    expect(app).toContain('validacion del formulario: elige catálogo o describe el material');
  });

  it('removes finished/cancelled assignments from active technician scope', () => {
    expect(migration).toContain('create or replace view public.v_technician_daily_schedule');
    expect(migration).toContain("wo.status in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material')");
    expect(migration).toContain("where a.deleted_at is null and a.status not in ('Finalizado','Cancelado')");
    expect(migration).toContain('create or replace function public.technician_global_search');
    expect(migration).toContain('join public.work_order_assignments a on a.work_order_id = wo.id and a.technician_id = public.current_profile_id() and a.deleted_at is null and a.status not in');
    expect(workOrdersService).toContain("not('status', 'in', '(Finalizado,Cancelado)')");
  });

  it('preserves deployed daily schedule view columns and appends new fields only at the end', () => {
    const initialColumns = viewSelectColumns(initialMigration, 'public.v_technician_daily_schedule');
    const recreatedColumns = viewSelectColumns(migration, 'public.v_technician_daily_schedule');
    expect(initialColumns).toEqual([
      'company_id', 'assignment_date', 'planned_start_time', 'planned_end_time', 'assignment_status', 'technician_id', 'technician_name', 'work_order_id', 'work_order_code', 'title', 'work_order_status', 'client_name', 'site_name', 'equipment_code',
    ]);
    expect(recreatedColumns.slice(0, initialColumns.length)).toEqual(initialColumns);
    expect(recreatedColumns.indexOf('assignment_id')).toBeGreaterThan(initialColumns.length - 1);
    expect(recreatedColumns.indexOf('assignment_role')).toBeGreaterThan(initialColumns.length - 1);
  });

  it('keeps pending checks view compatible with the initial projection', () => {
    const initialColumns = viewSelectColumns(initialMigration, 'public.v_pending_checks');
    const recreatedColumns = viewSelectColumns(migration, 'public.v_pending_checks');
    expect(initialColumns).toEqual(['*', 'equipment_code', 'work_order_code']);
    expect(recreatedColumns).toEqual(initialColumns);
  });

  it('keeps invoker views/search independent from private helpers and adds history source', () => {
    const invokerObjects = migration.match(/create or replace (?:view public\.v_technician_daily_schedule|view public\.v_pending_checks|function public\.technician_global_search)[\s\S]*?(?=create or replace|revoke all|$)/g) ?? [];
    expect(invokerObjects.length).toBeGreaterThanOrEqual(3);
    expect(invokerObjects.join('\n')).not.toContain('dmp024_is_work_order_active_status');
    expect(migration).toContain('create or replace view public.v_technician_assignment_history');
    expect(migration).toContain('create or replace function public.technician_assignment_history()');
    expect(migration).toContain('a.technician_id = v_profile.id');
    expect(migration).toContain('wo.company_id = v_profile.company_id');
    expect(migration).toContain("case when a.status = 'Cancelado' or a.deleted_at is not null then 'Desasignada'");
    expect(assignmentsService).toContain("supabase.rpc('technician_assignment_history')");
    expect(app).toContain('assignmentsService.assignmentHistory');
    expect(app).toContain('historial independiente');
  });

  it('finalizes technician assignments without deleting history and does not auto-reactivate on reopen', () => {
    expect(migration).toContain("p_new_status = 'Finalizado tecnicamente'");
    expect(migration).toContain("where work_order_id = p_work_order_id and deleted_at is null and status not in ('Finalizado','Cancelado')");
    expect(migration).not.toContain("set deleted_at = now(), status = 'Finalizado'");
    expect(migration).not.toContain("p_new_status = 'Pendiente' and");
    expect(migration).not.toContain("status = 'Asignado'");
  });

  it('covers active removal and no ghost assignment flows in 024 SQL', () => {
    expect(migration).toContain("where a.deleted_at is null and a.status not in ('Finalizado','Cancelado')");
    expect(migration).toContain("update public.work_order_assignments set status = 'Finalizado'");
    expect(migration).toContain("set deleted_at = now(), status = 'Cancelado'");
    expect(migration).not.toMatch(/p_new_status\s*=\s*'Pendiente'[\s\S]{0,200}status\s*=\s*'Asignado'/);
  });

  it('unassigns technicians atomically and clears only pending checks', () => {
    expect(migration).toContain('create or replace function public.unassign_work_order_profile');
    expect(migration).toContain("p_assignment_type text default 'technical'");
    expect(migration).toContain("p_assignment_type = 'technical'");
    expect(migration).toContain("p_assignment_type = 'commercial'");
    expect(migration).toContain("set deleted_at = now(), status = 'Cancelado'");
    expect(migration).toContain('main_technician_id = case when main_technician_id = p_profile_id then null');
    expect(migration).toContain('current_responsible_id = case when current_responsible_id = p_profile_id');
    expect(migration).toContain("update public.checks set technician_id = null");
    expect(migration).toContain("status <> 'Realizado'");
    expect(migration).toContain('work_order_status_history');
  });

  it('documents preflight and rollback verification for real fixtures', () => {
    expect(preflight).toContain('active_assignment_leaks_before_024');
    expect(preflight).toContain('pending_checks_with_inactive_assignment_before_024');
    expect(verification).toContain('rpc_permissions_after_024');
    expect(verification).toContain('technician_views_after_024');
    expect(verification).toContain('invoker_objects_do_not_call_private_helpers_024');
    expect(verification).toContain('technician_history_rpc_security_024');
    expect(verification).toContain('begin;');
    expect(verification).toContain('rollback;');
  });

  it('removes prompt based detail operations and adds real detail tabs', () => {
    const detailBlock = app.slice(app.indexOf('function WorkOrderDetailPageV2'), app.indexOf('function formatMinutes'));
    expect(detailBlock).toContain("const [tab, setTab]");
    expect(detailBlock).toContain('detail-tabs');
    expect(detailBlock).toContain('WorkOrderStatusSelector workOrder={data}');
    expect(detailBlock).toContain('Fotos y firmas');
    expect(detailBlock).toContain('ActivityTimeline events={activity}');
    expect(detailBlock).not.toContain('Timeline items={activity}');
    expect(app).toContain('function ReasonConfirmModal');
    expect(app).not.toContain("window.prompt('Motivo para eliminar este registro de horas')");
    expect(app).not.toContain("window.prompt('Motivo para eliminar este material')");
    expect(app).not.toContain('Confirma el cambio a ${displayStatus(next)}');
  });

  it('unifies technician hours and materials with RPC backed panels', () => {
    const technicianBlock = app.slice(app.indexOf('function TechnicianWorkPage'), app.indexOf('function TechnicianLocalForm'));
    expect(technicianBlock).toContain('WorkOrderTimeCard workOrder={data}');
    expect(technicianBlock).toContain('WorkOrderMaterialsCard workOrder={data}');
    expect(technicianBlock).toContain("setMode('time')");
    expect(technicianBlock).toContain("setMode('material')");
    expect(technicianBlock).toContain('Horas y materiales se guardan al confirmar');
    expect(technicianBlock).not.toContain('type="material"');
  });
});
