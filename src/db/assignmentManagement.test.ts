import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/workOrdersService.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/021_assignment_management_hardening.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_assignment_management.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_assignment_management_021.sql', import.meta.url), 'utf8');

describe('assignment management', () => {
  it('la migracion y el preflight son SQL parseable', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('elimina sobrecargas y deja solo la firma canonica de desasignacion con motivo', () => {
    expect(migration).toContain('drop function if exists public.unassign_work_order_profile(uuid, uuid, uuid, text)');
    expect(migration).toContain('drop function if exists public.unassign_work_order_profile(uuid, uuid, uuid)');
    expect(migration.replace(/\r\n/g, '\n')).toContain('create or replace function public.unassign_work_order_profile(\n  p_work_order_id uuid,\n  p_profile_id uuid,\n  p_changed_by uuid,\n  p_reason text default null\n) returns void');
    expect(migration.match(/create or replace function public\.unassign_work_order_profile/g)?.length).toBe(1);
    expect(migration).toContain('grant execute on function public.unassign_work_order_profile(uuid, uuid, uuid, text) to authenticated');
    expect(migration).not.toContain('grant execute on function public.unassign_work_order_profile(uuid, uuid, uuid) to authenticated');
    expect(migration).not.toMatch(/revoke all on function public\.unassign_work_order_profile\(uuid, uuid, uuid\)/i);
    expect(migration).toContain('revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid, text) from public');
    expect(migration).toContain("if exists (select 1 from pg_roles where rolname = 'anon') then");
    expect(migration).toContain('revoke all on function public.unassign_work_order_profile(uuid, uuid, uuid, text) from anon');
  });

  it('corrige desasignacion de comercial dejando current_responsible_id en null', () => {
    expect(migration).toContain('current_responsible_id = case when current_responsible_id = p_profile_id then null else current_responsible_id end');
    expect(migration).not.toContain('current_responsible_id = case when current_responsible_id = p_profile_id then p_changed_by else current_responsible_id end');
  });

  it('mantiene historial y soft delete de asignaciones', () => {
    expect(migration).toContain('set deleted_at = now(), status = \'Cancelado\'');
    expect(migration).toContain('insert into public.work_order_status_history');
    expect(migration).toContain('manual_correction');
  });

  it('incluye RPC atomico para principal, apoyos y comercial con RLS/empresa', () => {
    expect(migration).toContain('create or replace function public.manage_work_order_assignments');
    expect(migration).toContain('for update');
    expect(migration).toContain('perform public.assert_member_of_current_company(v_company_id)');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain('main_technician_id = p_main_technician_id');
    expect(migration).toContain('raise exception \'Un tecnico de apoyo no pertenece a la empresa o no esta activo\'');
    expect(migration).toContain('current_responsible_id = case when p_commercial_id is not null then p_commercial_id when v_existing_responsible_id is not null and not v_existing_responsible_is_commercial then v_existing_responsible_id else null end');
  });

  it('reconcilia datos reales sin borrar historial', () => {
    expect(migration).toContain('current_responsible_id = null');
    expect(migration).toContain("p.primary_area = 'Tecnico'");
    expect(migration).toContain('principal no vigente convertido a apoyo segun main_technician_id');
    expect(migration).toContain('having count(distinct active.technician_id) > 1');
    expect(migration).toContain("set role = 'Apoyo'");
    expect(migration).toContain('insert into public.work_order_status_history');
    expect(migration).not.toContain('delete from public.work_order_assignments');
  });

  it('tipa explicitamente changed_by como uuid en inserts de reconciliacion', () => {
    expect(migration).toContain("select company_id, id, status, status, null::uuid, 'Reconciliacion 021: current_responsible_id tecnico eliminado");
    expect(migration).toContain("select distinct company_id, id, status, status, null::uuid, 'Reconciliacion 021: principal no vigente convertido a apoyo");
    expect(migration).not.toContain("status, status, null, 'Reconciliacion 021");
  });

  it('assign_technician no modifica comercial y assign_commercial no modifica tecnico', () => {
    const assignTechnician = migration.slice(migration.indexOf('create or replace function public.assign_technician'), migration.indexOf('create or replace function public.manage_work_order_assignments'));
    expect(assignTechnician).not.toContain('current_responsible_id');
    const assignCommercial = readFileSync(new URL('../../supabase/migrations/018_rpc_reconcile_missing_frontend_functions.sql', import.meta.url), 'utf8');
    const body = assignCommercial.slice(assignCommercial.indexOf('create or replace function public.assign_commercial_work_order'), assignCommercial.indexOf('create or replace function public.create_work_order_full'));
    expect(body).not.toContain('main_technician_id');
    expect(body).not.toContain('work_order_assignments');
  });

  it('servicio expone desasignar canonico y gestion completa', () => {
    expect(service).toContain("supabase.rpc('unassign_work_order_profile'");
    expect(service).toContain('p_reason: reason ?? null');
    expect(service).toContain("supabase.rpc('manage_work_order_assignments'");
    expect(service).toContain('p_support_technician_ids');
    expect(service).toContain('p_commercial_id');
  });

  it('UI muestra tarjeta contextual, confirmacion y evita doble click', () => {
    expect(app).toContain('Equipo asignado');
    expect(app).toContain('Gestionar asignaciones');
    expect(app).toContain('¿Desasignar a ${fullName(confirm.person)} del parte ${workOrder.code}?');
    expect(app).toContain("savingId === row.id ? 'Desasignando...' : 'Desasignar'");
    expect(app).toContain('if (!confirm || savingId) return');
    expect(app).toContain('className="assignment-row"');
    expect(app).toContain("commercial ? 'Comercial' : 'Responsable'");
    expect(app).toContain('Motivo opcional');
    expect(app).toContain("commercial_id: isCommercialProfile(workOrder?.responsible) ? workOrder?.current_responsible_id : ''");
  });

  it('preflight audita firmas, roles heredados y duplicados antes de migrar', () => {
    expect(preflight).toContain("p.proname = 'unassign_work_order_profile'");
    expect(preflight).toContain('total_unassign_signatures');
    expect(preflight).toContain('signature_arguments');
    expect(preflight).toContain('responsible_role');
    expect(preflight).toContain("coalesce(r.name, p.primary_area, 'Sin rol') <> 'Comercial'");
    expect(preflight).toContain('wo.current_responsible_id = wo.main_technician_id');
    expect(preflight).toContain('having count(*) > 1');
    expect(preflight).toContain("having count(*) filter (where role = 'Principal') > 1");
    expect(preflight).toContain("having count(distinct technician_id) filter (where role = 'Principal') > 1");
  });

  it('verificacion post 021 exige firma unica, permisos y coherencia', () => {
    expect(verification).toContain('unassign_signature_count');
    expect(verification).toContain("has_function_privilege('anon'");
    expect(verification).toContain("has_function_privilege('authenticated'");
    expect(verification).toContain('technical_responsibles');
    expect(verification).toContain('work_orders_with_distinct_principal_conflicts');
    expect(verification).toContain('exact_active_assignment_duplicates');
  });

  it('roles no autorizados quedan denegados en permisos', () => {
    expect(permissions).toContain("export function canManageWorkOrderAssignments(profile: Profile | null | undefined) { return hasAny(profile, ['superadmin', 'SAT', 'Gerencia']); }");
  });
});
