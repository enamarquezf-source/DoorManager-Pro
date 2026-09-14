import { readFileSync } from 'node:fs';
import pgQuery from 'pg-query-emscripten';
import { describe, expect, it } from 'vitest';
import { canAccessModule, canAccessRoute, canManagePurchaseOrders, canViewPurchaseOrders, hasPermission } from '../auth/permissions';
import { userFacingErrorMessage } from '../shared/errorMessages';
import type { Profile, RoleName } from '../shared/types';

const migration = readFileSync(new URL('../../supabase/migrations/124_auth_rbac_runtime_fix.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_124_auth_rbac_runtime_fix.sql', import.meta.url), 'utf8');
const migration123 = readFileSync(new URL('../../supabase/migrations/123_auth_rbac_navigation.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/UserAccessPanel.tsx', import.meta.url), 'utf8');
const accessService = readFileSync(new URL('../services/accessService.ts', import.meta.url), 'utf8');
const profilesService = readFileSync(new URL('../services/profilesService.ts', import.meta.url), 'utf8');
const superadminService = readFileSync(new URL('../services/superadminService.ts', import.meta.url), 'utf8');

function profile(role: RoleName, overrides: Partial<Profile> = {}): Profile {
  return {
    id: `${role}-id`, company_id: 'company-a', auth_user_id: `${role}-auth`, first_name: role,
    last_name: 'Test', email: `${role}@test.local`, phone: null, primary_area: role,
    active: true, roles: [role], ...overrides,
  };
}

describe('AUTH-RBAC-002 runtime authorization and user administration', () => {
  it('parses migration 124 and its read-only verification', async () => {
    const migrationParser = await pgQuery();
    const verificationParser = await pgQuery();
    expect(migrationParser.parse(migration).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verificationParser.parse(verification).parse_tree.stmts.length).toBeGreaterThan(0);
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
  });

  it('returns every profiles composite field instead of a profiles value in column one', () => {
    expect(migration).toContain('returns setof public.profiles');
    expect(migration).toMatch(/return query\s+select p\.\*\s+from public\.profiles p/i);
    expect(migration).not.toMatch(/return query\s+select p\s+from public\.profiles p/i);
    for (const contract of ['v_proc.proretset', "v_proc.prorettype <> 'public.profiles'::regtype", 'to_regprocedure', 'has_function_privilege']) expect(verification).toContain(contract);
  });

  it('reconciles and verifies the purchase contract by canonical role joins', () => {
    for (const role of ['superadmin', 'Gerencia', 'Oficina', 'SAT']) expect(migration).toContain(`'${role}'`);
    for (const permission of ['purchase_orders.read', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.submit', 'purchase_orders.cancel']) {
      expect(migration).toContain(`'${permission}'`);
      expect(verification).toContain(`'${permission}'`);
    }
    expect(verification).toContain('from public.role_permissions');
    expect(verification).toContain('public.dmp_profile_has_permission');
    expect(verification).toContain('SAT purchase order read-only contract');
    expect(verification).toContain('Tecnico/Comercial has purchase order role defaults');
    expect(verification).toContain('Tecnico/Comercial has purchase receipt role defaults');
  });

  it('uses canonical access roles in the admin panel instead of primary_area fallback', () => {
    expect(panel).toContain('primary_area: null');
    expect(panel).toContain('roles: access.roles ?? []');
    expect(panel).not.toContain('roles: access.roles ?? user.roles ?? []');
    expect(verification).toContain('public.dmp_profile_has_permission');
    expect(profilesService).toContain("supabase.rpc('dmp_get_current_access')");
  });

  it('allows Office and tenant superadmin purchase actions and keeps SAT read-only', () => {
    const office = profile('Oficina');
    const owner = profile('superadmin');
    const sat = profile('SAT');
    for (const permission of ['purchase_orders.read', 'purchase_orders.create', 'purchase_orders.update', 'purchase_orders.submit', 'purchase_orders.cancel']) {
      expect(hasPermission(office, permission)).toBe(true);
      expect(hasPermission(owner, permission)).toBe(true);
    }
    expect(canViewPurchaseOrders(office)).toBe(true);
    expect(canManagePurchaseOrders(office)).toBe(true);
    expect(canAccessRoute(office, '/app/modulos/compras')).toBe(true);
    expect(canViewPurchaseOrders(sat)).toBe(true);
    expect(canManagePurchaseOrders(sat)).toBe(false);
    expect(canAccessRoute(sat, '/app/modulos/compras')).toBe(true);
  });

  it('keeps sidebar, route authorization and explicit visibility overrides aligned', () => {
    expect(app).toContain("const purchases = { id: 'compras'");
    for (const workspace of ['superadmin', 'sat', 'oficina']) expect(app).toContain(`workspace === '${workspace}') return withPurchases`);
    expect(app).toContain('return withPurchases(gerencia)');
    for (const role of ['superadmin', 'Oficina', 'Gerencia', 'SAT'] as RoleName[]) {
      expect(canAccessModule(profile(role), role === 'superadmin' ? 'superadmin' : role.toLowerCase() as any, 'compras')).toBe(true);
    }
    const hiddenOffice = profile('Oficina', { hidden_modules: ['purchase_orders'], visible_modules: [] });
    expect(canAccessModule(hiddenOffice, 'oficina', 'compras')).toBe(false);
    expect(canAccessRoute(hiddenOffice, '/app/modulos/compras')).toBe(false);
    const visibleTechnician = profile('Tecnico', { visible_modules: ['purchase_orders'] });
    expect(canAccessRoute(visibleTechnician, '/app/modulos/compras')).toBe(false);
  });

  it('keeps purchase RPC and RLS guards on the same permission namespace and tenant scope', () => {
    for (const [rpc, permission] of [
      ['dmp_create_purchase_order', 'purchase_orders.create'],
      ['dmp_update_purchase_order', 'purchase_orders.update'],
      ['dmp_add_purchase_order_line', 'purchase_orders.update'],
      ['dmp_order_purchase_order', 'purchase_orders.submit'],
    ]) {
      expect(migration123).toContain(`public.${rpc}`);
      expect(migration123).toContain(`public.has_permission('${permission}')`);
    }
    expect(verification).toContain('RLS USING');
    expect(verification).toContain('RLS WITH CHECK');
    expect(verification).toContain('is_platform_superadmin()');
    expect(verification).toContain('current_company_id()');
  });

  it('uses only the canonical Supabase client for user administration calls', () => {
    for (const source of [panel, accessService, profilesService, superadminService]) {
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios|\/rest\/v1|\/functions\/v1/i);
      expect(source).not.toMatch(/service_role|['"]apikey['"]\s*:/i);
    }
    expect(accessService).toContain("import { supabase } from '../lib/supabase/client'");
    expect(superadminService).toContain("supabase.rpc('dmp_admin_list_users')");
    expect(superadminService).toContain("supabase.from('profile_roles')");
    expect(accessService).toContain("supabase.rpc('dmp_admin_get_user_access'");
    expect(profilesService).toContain("supabase.rpc('dmp_get_current_access')");
  });

  it('does not disguise purchase data or runtime failures as permission denials', () => {
    expect(userFacingErrorMessage(new Error('create purchase order: empresa: proveedor no valido'))).toBe('El proveedor seleccionado no está disponible.');
    expect(userFacingErrorMessage(new Error('create purchase order: permiso: no puedes gestionar pedidos de compra'))).toBe('No tienes permisos para crear pedidos de compra.');
    expect(userFacingErrorMessage(new Error('update purchase order: permiso: no puedes gestionar pedidos de compra'))).toBe('No tienes permisos para realizar esta operación sobre pedidos de compra.');
    expect(userFacingErrorMessage(new Error('create purchase order: structure of query does not match function result type'), 'No se ha podido guardar el pedido de compra.')).toBe('No se ha podido guardar el pedido de compra.');
    expect(userFacingErrorMessage(new Error('create purchase order: row-level security policy violation'), 'No se ha podido guardar el pedido de compra.')).toBe('No se ha podido guardar el pedido de compra.');
  });

  it('keeps technical backend details out of the user-admin UI and blocks raw svg text', () => {
    expect(superadminService).toContain('No se ha podido cargar la gestión de usuarios. Inténtalo de nuevo.');
    expect(accessService).toContain('No se han podido cargar los permisos y la visibilidad. Inténtalo de nuevo.');
    expect(`${app}\n${panel}`).not.toMatch(/>\s*svg\s*</i);
    for (const detail of ['42804', 'PostgREST', 'No API key found']) expect(`${app}\n${panel}`).not.toContain(detail);
    expect(app).toContain('const requestId = ++authRequestId.current');
    expect(app).toContain('const nextProfile = await profilesService.getCurrentProfile()');
    expect(app).toContain('/No hay sesión activa|No hay un perfil enlazado|Usuario desactivado/');
    expect(app).toContain("window.addEventListener('focus', refreshAccess)");
    expect(app).toContain("return roles.length ? roles.map(roleLabel).join(', ') : 'Sin roles';");
    expect(panel).toContain('disabled={saving || !dirty}');
  });

  it('verifies user access RPC shapes and preserves update boundaries', () => {
    for (const signature of ['dmp_admin_get_user_access(uuid)', 'dmp_admin_update_user_access(uuid,text[],jsonb,jsonb)', 'dmp_get_current_access()']) expect(verification).toContain(signature);
    for (const boundary of ['dmp_can_manage_tenant_superadmin_target', 'cardinality(p_role_names) = 0', 'delete from public.profile_permission_grants', 'insert into public.audit_log']) expect(verification).toContain(boundary);
    expect(verification).toContain('has_function_privilege');
    expect(verification).toContain('aclexplode');
  });
});
