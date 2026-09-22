import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(new URL('../../supabase/functions/admin-user-lifecycle/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/143_auth_invite_link_helper.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_143_auth_invite_link_helper.sql', import.meta.url), 'utf8');
const migration144 = readFileSync(new URL('../../supabase/migrations/144_revoke_auth_invite_actor_service_role.sql', import.meta.url), 'utf8');
const verification144 = readFileSync(new URL('../../supabase/verification/verify_144_revoke_auth_invite_actor_service_role.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/authAdminService.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/UserAccessPanel.tsx', import.meta.url), 'utf8');

describe('AUTH-1 secure invite and link contract', () => {
  it('keeps Auth Admin and service role server-side', () => {
    expect(edge).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(edge).toContain('inviteUserByEmail');
    expect(service).not.toContain('SERVICE_ROLE');
    expect(panel).not.toContain('SERVICE_ROLE');
  });

  it('parses the DB helper and keeps the verification read-only', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
  });

  it('requires JWT actor resolution and tenant profile_roles Superadmin authority', () => {
    expect(edge).toContain('auth.getUser(token)');
    expect(edge).toContain("eq('auth_user_id', userData.user.id)");
    expect(edge).toContain('profile_roles');
    expect(edge).toContain("row.roles?.name === 'superadmin'");
    expect(edge).not.toContain('primary_area');
    expect(edge).not.toContain('is_platform_superadmin');
    expect(edge).not.toContain('workspace');
  });

  it('accepts canonical PostgreSQL UUIDs without requiring RFC version bits', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isProfileId = (value: unknown) => typeof value === 'string' && uuidPattern.test(value);
    expect(edge).toContain('const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;');
    expect(isProfileId('10000000-0000-0000-0000-000000000008')).toBe(true);
    expect(isProfileId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isProfileId('abc')).toBe(false);
    expect(isProfileId('10000000-0000-0000-0000-00000000000')).toBe(false);
    expect(isProfileId(null)).toBe(false);
  });

  it('handles idempotency, marker-based reconciliation and conditional linking', () => {
    expect(edge).toContain("status: 'already_linked'");
    expect(edge).toContain('dmp_invite_intent_id');
    expect(edge).toContain('dmp_admin_reserve_auth_invite');
    expect(edge).toContain('crypto.randomUUID()');
    expect(edge).toContain('dmp_admin_record_auth_invite');
    expect(edge).toContain('dmp_admin_release_auth_invite');
    expect(edge).toContain('dmp_admin_finalize_auth_invite');
    expect(edge).toContain('marker update deferred');
    expect(migration).toContain('auth_invite_intents');
    expect(migration).toContain('auth_user_id is null');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('auth.users');
    expect(migration).toContain("'invite_and_link'");
    expect(migration).toContain('v_actor.id');
    expect(migration).toContain('platform_superadmins');
    expect(migration).toContain('v_is_platform');
    expect(verification).toContain("'EXECUTE'");
    expect(verification).toContain('to_regprocedure');
    expect(verification).toContain('aclexplode');
    expect(verification).toContain('raise exception');
  });

  it('keeps the link helper unavailable to browser roles', () => {
    expect(migration).toContain('revoke all on function public.dmp_admin_reserve_auth_invite(uuid, uuid, uuid)');
    expect(migration).toContain('revoke all on function public.dmp_admin_record_auth_invite(uuid, uuid, uuid, uuid)');
    expect(migration).toContain('revoke all on function public.dmp_admin_release_auth_invite');
    expect(migration).toContain('revoke all on function public.dmp_admin_finalize_auth_invite');
    expect(migration).toContain('to service_role');
    expect(verification).toContain("has_function_privilege('authenticated'");
  });

  it('covers the partial-failure and concurrency recovery contract', () => {
    expect(edge).toContain('state === \'invited\'');
    expect(edge).toContain('getUserById(intent.auth_user_id)');
    expect(edge).toContain('!intent.auth_user_id');
    expect(edge).toContain('p_operation_id: operationId');
    expect(migration).toContain('profile_id uuid not null unique');
    expect(migration).toContain('auth_invite_intents_auth_user_unique');
    expect(edge).toContain("state === 'busy'");
    expect(migration).toContain('lease_expires_at');
    expect(migration).toContain("state = 'invited'");
    expect(migration).toContain("state = 'linked'");
    expect(migration).toContain('operation_id is distinct from p_operation_id');
    expect(migration).toContain("if v_intent.operation_id is not null and");
    expect(migration).not.toContain("v_intent.state <> 'invited' and v_intent.operation_id");
    expect(migration).toContain("case when auth_user_id is null then 'pending' else 'invited' end");
  });

  it('explicitly verifies invited busy, takeover and structural indexes', () => {
    expect(migration).toContain("state', 'busy'");
    expect(migration).toContain('lease_expires_at > now()');
    expect(verification).toContain('pg_index');
    expect(verification).toContain('pg_attribute');
    expect(verification).toContain('indisunique');
    expect(verification).toContain('indpred');
    expect(verification).toContain('conkey');
    expect(verification).toContain('indkey');
    expect(verification).toContain('actor helper service_role execute');
  });

  it('does not expose full identity errors or credentials', () => {
    expect(edge).toContain('Origen no permitido.');
    expect(edge).toContain('No se puede verificar de forma segura la cuenta Auth existente.');
    expect(edge).not.toContain('return serviceRoleKey');
    expect(edge).not.toContain('SUPABASE_SERVICE_ROLE_KEY:');
  });

  it('keeps migration 144 limited to the internal actor helper ACL hotfix', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration144).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification144).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(migration144).toContain('revoke execute on function public.dmp_auth_invite_actor(uuid) from service_role');
    expect(migration144).not.toContain('dmp_admin_reserve_auth_invite');
    expect(migration144).not.toContain('auth_invite_intents');
  });

  it('verifies actor/helper ACLs independently from verify 143', () => {
    expect(verification144).toContain("to_regprocedure(v_signature)");
    expect(verification144).toContain('aclexplode');
    expect(verification144).toContain("actor helper service_role EXECUTE");
    expect(verification144).toContain('operational helper service_role EXECUTE missing');
    expect(verification144).toContain("has_function_privilege('anon'");
    expect(verification144).toContain("has_function_privilege('authenticated'");
  });
});
