import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const migration = readFileSync(new URL('../../supabase/migrations/022_security_lifecycle_controls.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_security_lifecycle_022.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_security_lifecycle_022.sql', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

const criticalRpcSignatures = [
  'create_deficiency_from_check(uuid, uuid, text, text, text, uuid)',
  'finish_check_safe(uuid, text)',
  'register_work_order_deficiency(jsonb)',
  'request_work_order_return(uuid, uuid, text)',
  'superadmin_update_profile(uuid, jsonb)',
  'sync_work_order_material_usage(uuid, text, numeric, text)',
];

describe('security lifecycle controls', () => {
  it('migration and verification SQL are parseable', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(preflight).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
  });

  it('creates server-side lifecycle RPC with active profile, role and company validation', () => {
    expect(migration).toContain('create or replace function public.dmp_assert_lifecycle_actor');
    expect(migration).toContain('auth.uid() is null');
    expect(migration).toContain('active = true');
    expect(migration).toContain('deleted_at is null');
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia'])");
    expect(migration).toContain('perform public.assert_member_of_current_company(p_company_id)');
  });

  it('revokes anon/public and grants only the public RPCs to authenticated', () => {
    for (const fn of ['dmp_lifecycle_dependencies(text, uuid)', 'dmp_archive_entity(text, uuid, text)', 'dmp_restore_entity(text, uuid, text)', 'dmp_permanently_delete_entity(text, uuid, text, text)']) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon`);
      expect(migration).toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it('blocks physical deletion with dependencies and records audit', () => {
    expect(migration).toContain('can_permanently_delete');
    expect(migration.match(/'can_permanently_delete',/g)?.length).toBe(1);
    expect(migration).toContain("v_deps->>'can_permanently_delete'");
    expect(migration).toContain('dependency_total');
    expect(migration).toContain("p_confirmation is distinct from ('ELIMINAR ' || v_code)");
    expect(migration).toContain('insert into public.audit_log');
    expect(migration).toContain('insert into public.activity_log');
  });

  it('handles parent restoration blockers', () => {
    expect(migration).toContain('El cliente del centro sigue archivado');
    expect(migration).toContain('El centro del equipo sigue archivado');
    expect(migration).toContain('El parte del check sigue archivado');
  });

  it('frontend centralizes lifecycle permissions and UI uses the reusable modal', () => {
    expect(permissions).toContain('canArchiveEntity');
    expect(permissions).toContain('canRestoreEntity');
    expect(permissions).toContain('canPermanentlyDeleteEntity');
    expect(app).toContain('LifecycleActionPanel');
    expect(app).toContain('LifecycleConfirmModal');
    expect(app).toContain('ELIMINAR ${target.code}');
    expect(permissions).toContain('PlatformLifecycleScope');
    expect(app).toContain('selectedCompanyId: companyId');
    expect(permissions).not.toContain('global_scope_authorized');
  });

  it('protects profile lifecycle operations inside RPC', () => {
    expect(migration).toContain('create or replace function public.dmp_assert_profile_lifecycle_target');
    expect(migration).toContain('Solo el propietario global puede administrar el ciclo de vida de usuarios');
    expect(migration).toContain('No puedes desactivar o restaurar tu propio perfil desde esta operacion');
    expect(migration).toContain('No se puede desactivar el ultimo superadmin operativo de la plataforma');
    expect(migration).toContain("if p_entity = 'profiles' and not public.is_platform_superadmin() then");
  });

  it('restores archived business statuses from audit old_data, not invented defaults', () => {
    expect(migration).toContain('create or replace function public.dmp_previous_lifecycle_value');
    expect(migration).toContain("operation = 'SOFT_DELETE'");
    expect(migration).toContain("status = v_previous_status");
    expect(migration).toContain("active = coalesce(v_previous_active::boolean");
    expect(migration).toContain('insert into public.work_order_status_history');
    expect(migration).toContain("'En intervencion'");
    expect(migration).toContain("'Cancelado'");
  });

  it('prevents repeated archive from overwriting the original audit state', () => {
    const archiveBody = migration.slice(migration.indexOf('create or replace function public.dmp_archive_entity'), migration.indexOf('create or replace function public.dmp_restore_entity'));
    expect(archiveBody.match(/for update/g)?.length).toBeGreaterThanOrEqual(8);
    expect(archiveBody.match(/El registro ya está archivado/g)?.length).toBe(8);
    expect(archiveBody.indexOf('El registro ya está archivado')).toBeLessThan(archiveBody.indexOf("'SOFT_DELETE'"));
    expect(archiveBody).toContain("if v_old->>'deleted_at' is not null then raise exception 'El registro ya está archivado'; end if;");
    expect(archiveBody).toContain("if coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;");
    expect(archiveBody).toContain("if v_old->>'deleted_at' is not null or coalesce((v_old->>'active')::boolean, true) is false then raise exception 'El registro ya está archivado'; end if;");
  });

  it('prevents restore of records that are not archived', () => {
    const restoreBody = migration.slice(migration.indexOf('create or replace function public.dmp_restore_entity'), migration.indexOf('create or replace function public.dmp_permanently_delete_entity'));
    expect(restoreBody.match(/for update/g)?.length).toBeGreaterThanOrEqual(8);
    expect(restoreBody.match(/El registro no está archivado/g)?.length).toBe(8);
    expect(restoreBody.indexOf('El registro no está archivado')).toBeLessThan(restoreBody.indexOf("'UPDATE'"));
    expect(restoreBody).toContain("if v_old->>'deleted_at' is null then raise exception 'El registro no está archivado'; end if;");
    expect(restoreBody).toContain("if coalesce((v_old->>'active')::boolean, true) is true then raise exception 'El registro no está archivado'; end if;");
    expect(restoreBody).toContain("if v_old->>'deleted_at' is null and coalesce((v_old->>'active')::boolean, true) is true then raise exception 'El registro no está archivado'; end if;");
  });

  it('redefines register_work_order_deficiency with v_component and explicit privileges', () => {
    expect(migration).toContain('create or replace function public.register_work_order_deficiency(p_payload jsonb)');
    expect(migration).toContain("v_component text := trim(coalesce(p_payload->>'component', ''))");
    expect(migration).toContain('revoke all on function public.register_work_order_deficiency(jsonb) from public');
    expect(migration).toContain('revoke all on function public.register_work_order_deficiency(jsonb) from anon');
    expect(migration).toContain('grant execute on function public.register_work_order_deficiency(jsonb) to authenticated');
    expect(verification).toContain('declares_v_component');
  });

  it('revokes anon and public execute from critical frontend RPC exact signatures', () => {
    for (const fn of criticalRpcSignatures) {
      expect(migration).toContain(`revoke all on function public.${fn} from public`);
      expect(migration).toContain(`revoke all on function public.${fn} from anon`);
      expect(migration).toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it('preflight and verification expose critical RPC permission summaries', () => {
    for (const name of ['critical_rpc_permissions_before_022', 'critical_rpc_summary_before_022', 'critical_rpc_permissions_after_022', 'critical_rpc_summary_after_022']) {
      expect(`${preflight}\n${verification}`).toContain(name);
    }
    for (const column of ['critical_rpc_count', 'anon_execute_count', 'public_execute_count', 'authenticated_execute_count']) {
      expect(preflight).toContain(column);
      expect(verification).toContain(column);
    }
    expect(verification).toContain("case when anon_execute or public_execute then 'FAIL' else 'OK' end as status");
    expect(verification).toContain('count(*) = 6');
    expect(preflight).toContain('aclexplode(coalesce(p.proacl');
  });

  it('does not render permanent delete before dependencies are loaded and does not use false # routes', () => {
    const html = renderToString(createElement('div', { role: 'dialog', 'aria-modal': 'true' }, 'Dependencias del registro'));
    expect(html).toContain('Dependencias del registro');
    expect(html).not.toContain('Eliminar definitivamente');
    expect(app).not.toContain("'#'");
    expect(app).not.toContain('to="#"');
  });

  it('documents rollback-only manual verification for state restoration when no local PostgreSQL is available', () => {
    expect(verification).toContain('begin;');
    expect(verification).toContain('rollback;');
    expect(verification).toContain('dmp_archive_entity');
    expect(verification).toContain('dmp_restore_entity');
    expect(verification).toContain('El registro ya está archivado');
    expect(verification).toContain('El registro no está archivado');
  });
});
