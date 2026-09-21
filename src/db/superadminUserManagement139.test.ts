import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/139_harden_tenant_user_management.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_139_harden_tenant_user_management.sql', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/UserAccessPanel.tsx', import.meta.url), 'utf8');
const rbac = readFileSync(new URL('../auth/rbac.ts', import.meta.url), 'utf8');
const permissions = readFileSync(new URL('../auth/permissions.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../services/superadminService.ts', import.meta.url), 'utf8');

describe('SUPERADMIN-USER-MANAGEMENT-029', () => {
  it('parses the review-only migration contract', async () => {
    const parser = await pgQuery();
    expect(parser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(parser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    expect(migration).toContain('set search_path = public');
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('dmp:tenant-user-management:' || v_company_id::text, 0))");
    expect(migration).toContain('revoke all on function public.superadmin_save_profile_with_roles');
    expect(migration).toContain('grant execute on function public.superadmin_save_profile_with_roles');
    expect(migration).toContain('create or replace function public.dmp_admin_update_user(');
    expect(migration).toContain('grant execute on function public.dmp_admin_update_user(uuid, jsonb)');
    for (const signature of ['superadmin_create_profile(jsonb)', 'superadmin_update_profile(uuid, jsonb)', 'superadmin_set_profile_roles(uuid, text[])']) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated`);
    }
    expect(migration).not.toContain('grant execute on function public.dmp_assert_user_management_transition');
    expect(migration).not.toContain('138_tenant_superadmin_user_administration');
  });

  it('protects Auth linkage, tenant scope, self-degrade and the last tenant Superadmin', () => {
    expect(migration).toContain("p_profile ? 'auth_user_id'");
    expect(migration).toContain('public.current_company_id()');
    expect(migration).toContain('dmp_assert_user_management_transition');
    expect(migration).toContain('no puedes degradar ni desactivar tu propio Superadmin');
    expect(migration).toContain('no puedes dejar la empresa sin Superadmin activo');
    expect(migration).toContain('public.dmp_can_manage_tenant_superadmin_target');
    expect(migration).toContain('public.dmp_can_grant_tenant_superadmin');
    expect(migration).toContain('insert into public.audit_log');
    expect(migration).toContain("p_payload ? 'auth_user_id'");
    expect(migration).toContain("p_payload ? 'company_id'");
    expect(migration).toContain("p_payload ? 'primary_area'");
    expect(migration).toContain("case when p_profile_id is null then 'INSERT' else 'UPDATE' end");
    expect(migration).toContain('v_old_profile');
    expect(verification).toContain('aclexplode');
    expect(verification).toContain('authenticated_execute');
    expect(verification).toContain('pg_get_functiondef');
  });

  it('locks the company before recounting Superadmins and refreshes the target', () => {
    const lock = migration.indexOf("pg_advisory_xact_lock(hashtextextended('dmp:tenant-user-management:' || v_company_id::text, 0))");
    const refresh = migration.indexOf('for update', lock);
    const count = migration.indexOf('select count(*) into v_remaining', lock);
    expect(lock).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(lock);
    expect(count).toBeGreaterThan(lock);
    expect(migration.indexOf('if p_profile_id = v_actor_id', lock)).toBeGreaterThan(lock);
  });

  it('keeps migration 139 independent from the unpublished 138 artifact', () => {
    expect(migration).toContain('create or replace function public.dmp_can_manage_tenant_superadmin_target');
    expect(migration).not.toContain('Review and deploy after migration 138');
    expect(verification).toContain("public.dmp_can_manage_tenant_superadmin_target(uuid)");
    expect(verification).toContain("('public.dmp_assert_user_management_transition(uuid,boolean,text[])', false)");
    expect(verification).toContain("('public.dmp_admin_update_user(uuid,jsonb)', true)");
  });

  it('routes legacy active mutations through the serialized transition guard', () => {
    const legacy = migration.indexOf('create or replace function public.dmp_admin_update_user(');
    const profile = migration.indexOf('create or replace function public.superadmin_save_profile_with_roles(');
    const body = migration.slice(legacy, profile);
    expect(body).toContain('v_active := case when p_payload ? \'active\'');
    expect(body).toContain('perform public.dmp_assert_user_management_transition(v_old.id, v_active, v_roles)');
    expect(body).toContain('p_payload ? \'auth_user_id\'');
    expect(body).toContain('p_payload ? \'company_id\'');
    expect(body).not.toContain('primary_area =');
  });

  it('requires explicit roles on create and never uses primary_area as role input', () => {
    expect(migration).toContain("p_profile_id is null and (p_role_names is null or cardinality(p_role_names) = 0)");
    expect(migration).toContain('la creación requiere roles explícitos');
    expect(migration).toContain("if p_role_names is null or cardinality(p_role_names) = 0 then");
    expect(migration).not.toContain("p_profile->>'primary_area'");
    expect(verification).toContain("p_profile->>''primary_area''");
    expect(service).toContain('normalizedRoleNames(undefined, roleNames');
    expect(service).toContain("key !== 'primary_area'");
  });

  it('keeps access audit inserts on the audit_log contract', () => {
    const access = migration.slice(migration.indexOf('create or replace function public.dmp_admin_update_user_access('));
    for (const table of ['profile_roles', 'profile_permission_grants', 'profile_module_visibility']) {
      expect(access).toContain(`insert into public.audit_log(company_id, table_name, record_id, operation, changed_by, old_data, new_data) values (v_target.company_id, '${table}'`);
    }
    expect(access).toContain('insert into public.profile_module_visibility(profile_id, module_id, visible, updated_at)');
    expect(access).toContain("values (v_target.id, v_module_id, (v_item->>'visible')::boolean, now())");
    expect(access).toContain('on conflict (profile_id, module_id)');
    expect(access).toContain('visible = excluded.visible');
    expect(access).toContain('updated_at = now()');
    expect(access).not.toContain('changed_by, v_old_modules, p_module_visibility');
    expect(verification).toContain('profile_module_visibility');
    expect(verification).toContain("old_data' in v_source");
    expect(verification).toContain("new_data' in v_source");
  });

  it('calculates v_active before self-degrade and transition guards', () => {
    const save = migration.slice(migration.indexOf('create or replace function public.superadmin_save_profile_with_roles('));
    const active = save.indexOf("v_active := case when p_profile ? 'active'");
    expect(active).toBeGreaterThan(-1);
    expect(active).toBeLessThan(save.indexOf('if v_profile.id = v_actor.id'));
    expect(active).toBeLessThan(save.indexOf('perform public.dmp_assert_user_management_transition'));
    expect(verification).toContain("v_active := case when p_profile ? ''active''");
  });

  it('separates role permission from the Superadmin elevation guard', () => {
    expect(migration).toContain("public.has_permission('admin.roles.manage')");
    expect(migration).toContain('seguridad: no puedes conceder privilegios de Superadmin');
    expect(migration).toContain("revoke insert, update, delete on table public.profile_roles from public, anon, authenticated");
    expect(verification).toContain("public.dmp_can_grant_tenant_superadmin(uuid)");
    expect(verification).toContain('direct profile_roles writes remain client-callable');
  });

  it('accepts the applied grant helper without requiring a cosmetic alias', () => {
    expect(verification).toContain("position('deleted_at is null' in v_source)");
    expect(verification).not.toContain("position('p.deleted_at is null' in v_source)");
    expect(verification).toContain("regexp_replace(pg_get_functiondef(v_oid), '\\s+', ' ', 'g')");
  });

  it('covers normal role changes without allowing lower-actor Superadmin elevation', () => {
    const save = migration.slice(migration.indexOf('create or replace function public.superadmin_save_profile_with_roles('));
    const access = migration.slice(migration.indexOf('create or replace function public.dmp_admin_update_user_access('));
    expect(save).toContain("'admin.roles.manage'");
    expect(save).toContain("'superadmin' = any(v_roles)");
    expect(access).toContain("'superadmin' = any(p_role_names)");
    expect(access).toContain('dmp_can_grant_tenant_superadmin');
  });

  it('keeps the ficha human-readable and separates roles, grants, modules, operativa and Auth', () => {
    for (const section of ['General', 'Seguridad', 'Acceso y roles', 'Permisos efectivos', 'Módulos visibles', 'Operativa']) expect(panel).toContain(section);
    expect(panel).toContain('Concedido por rol');
    expect(panel).toContain('Grant individual');
    expect(panel).toContain('profile.id');
    expect(panel).not.toContain('service_role');
    expect(rbac).toContain("treasury: 'Tesorería'");
  });

  it('uses profile_roles, not primary_area, as frontend authority', () => {
    expect(rbac).toContain('profile.roles?.includes(\'superadmin\')');
    expect(rbac).toContain('(profile.roles ?? []).flatMap(rolePermissionKeys)');
    expect(permissions).toContain('return [...new Set((profile?.roles ?? []).filter(Boolean))]');
  });
});
