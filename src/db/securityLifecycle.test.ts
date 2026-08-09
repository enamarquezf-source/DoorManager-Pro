import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(new URL('../../supabase/migrations/022_security_lifecycle_controls.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../../supabase/verification/preflight_security_lifecycle_022.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_security_lifecycle_022.sql', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

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
  });
});
