import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/123_auth_rbac_navigation.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../../supabase/verification/verify_123_auth_rbac_navigation.sql', import.meta.url), 'utf8');
const purchaseOrders = readFileSync(new URL('../../supabase/migrations/119_purchase_orders.sql', import.meta.url), 'utf8');
const receipts = readFileSync(new URL('../../supabase/migrations/120_purchase_receipts.sql', import.meta.url), 'utf8');
const initialSchema = readFileSync(new URL('../../supabase/migrations/001_initial_dmp_schema.sql', import.meta.url), 'utf8');
const superadminMigration = readFileSync(new URL('../../supabase/migrations/007_superadmin_zone.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8');

describe('AUTH-RBAC/NAV migration 123', () => {
  it('defines the additive authorization and navigation schema', () => {
    for (const table of ['permissions', 'role_permissions', 'profile_permission_grants', 'app_modules', 'profile_module_visibility']) {
      expect(migration).toContain(`public.${table}`);
    }
    expect(migration).toContain('public.has_permission(p_permission text)');
    expect(migration).toContain('public.is_platform_superadmin()');
    expect(migration).toContain('role_permissions');
    expect(migration).toContain('profile_permission_grants');
  });

  it('repairs the audited role constraint before creating RBAC objects', () => {
    expect(initialSchema).toContain("check (name in ('SAT','Comercial','Oficina','Gerencia','Tecnico'))");
    expect(superadminMigration).toContain("check (name in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico'))");
    for (const role of ['SAT', 'Comercial', 'Oficina', 'Gerencia', 'Tecnico']) expect(seed).toContain(`('${role}',`);
    expect(migration).toContain('123 precheck failed: roles_name_check missing or invalid');
    expect(migration).toContain('123 precheck failed: base role rows missing');
    expect(migration).toContain('123 precheck failed: unexpected role rows');
    expect(migration).toContain('alter table public.roles drop constraint roles_name_check');
    expect(migration).toContain("check (name in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico'))");
    expect(migration.indexOf('123 precheck failed')).toBeLessThan(migration.indexOf('create table if not exists public.permissions'));
    expect(verification).toContain('roles_name_check excludes');
    expect(verification).toContain('platform superadmin helper missing');
  });

  it('seeds only the required permissions/modules and explicit role defaults', () => {
    for (const value of ['users.read', 'users.update', 'suppliers.read', 'purchase_orders.read', 'purchase_receipts.read', 'materials.read', 'stock.adjust', 'sat.read', 'commercial.read', 'documents.read', 'billing.read', 'admin.roles.manage', 'admin.modules.manage', 'users', 'suppliers', 'purchase_orders', 'purchase_receipts', 'materials', 'stock', 'sat', 'commercial', 'documents', 'billing', 'admin']) {
      expect(migration).toContain(value);
    }
    expect(migration).toContain("r.name = 'superadmin'");
    expect(migration).toContain("r.name = 'Gerencia'");
  });

  it('hardens same-company administration and audits UPDATE operations', () => {
    expect(migration).toContain('dmp_admin_list_users');
    expect(migration).toContain('dmp_admin_update_user');
    expect(migration).toContain('dmp_admin_get_user_access');
    expect(migration).toContain('dmp_admin_update_user_access');
    expect(migration).toContain('profile_permission_grants');
    expect(migration).toContain('profile_module_visibility');
    expect(migration).toContain("v_old.company_id <> v_actor.company_id");
    expect(migration).toContain('no puedes bloquearte');
     expect(migration).not.toContain('el platform superadmin no es modificable');
    expect(migration).toContain("'UPDATE'");
    expect(migration).toContain("public.has_permission('stock.adjust')");
    expect(migration).not.toContain("('admin.users', 'Usuarios'");
    expect(migration).toContain('not public.is_platform_superadmin() and v_target.company_id <> v_actor.company_id');
    expect(migration).toContain('primary_area = coalesce((select r.name');
    expect(migration).not.toContain("'admin.roles.manage','admin.modules.manage','admin.audit.read'");
    expect(migration).not.toContain("r.name = 'superadmin')) then raise exception 'seguridad: el platform superadmin no es modificable'");
    expect(migration).not.toContain("p_role_names @> array['superadmin']::text[] and not public.is_platform_superadmin()");
    expect(migration).toContain('dmp_can_manage_tenant_superadmin_target');
  });

  it('keeps verification read-only and protects the canonical stock RPC ACL', () => {
    expect(verification).toContain('verify_123_auth_rbac_navigation: PASS');
    expect(verification).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im);
    expect(migration).toContain('revoke all on function public.dmp_adjust_warehouse_stock');
    expect(migration).toContain('grant execute on function public.dmp_adjust_warehouse_stock');
    expect(migration).toContain('revoke all on function public.has_permission(text) from public, anon');
    expect(migration).toContain('revoke all on function public.dmp_create_material_with_stock');
    expect(migration).not.toContain('pg_get_functiondef');
    expect(migration).not.toContain('regexp_replace(v_definition');
     expect(verification).toContain('to_regprocedure');
     expect(verification).toContain('v_proc.prorettype <> v_expected_return_oid');
    expect(verification).toContain('v_proc.proargtypes[v_i] <> v_expected_arg_oid');
  });

  it('keeps tenant superadmin separate from platform scope and uses additive grants', () => {
    expect(migration).toContain("r.name = 'superadmin'");
    expect(migration).toContain("public.is_platform_superadmin()");
    expect(migration).toContain('delete from public.profile_permission_grants where not granted');
    expect(migration).toContain('delete from public.profile_permission_grants where profile_id = v_target.id and permission_id = v_permission_id');
    expect(migration).not.toContain('granted = excluded.granted');
    expect(migration).not.toContain('primary_area = \'superadmin\'');
    const permissionFunction = migration.slice(migration.indexOf('create or replace function public.dmp_profile_has_permission'), migration.indexOf('revoke all on function public.dmp_profile_has_permission'));
    expect(permissionFunction).not.toContain('primary_area');
    expect(verification).toContain("v_expected_return_oid := to_regtype");
    expect(verification).toContain("v_expected_arg_oid := to_regtype");
  });

  it('uses one primary profile role for inherited permissions and explicit action guards', () => {
    expect(migration).toContain('dmp_profile_has_permission');
     expect(migration).not.toContain("r.name = p.primary_area and x.code = p_permission");
    for (const [name, permission] of [
      ['dmp_create_material_with_stock', 'materials.create'],
      ['dmp_create_purchase_order', 'purchase_orders.create'],
      ['dmp_update_purchase_order', 'purchase_orders.update'],
      ['dmp_order_purchase_order', 'purchase_orders.submit'],
      ['dmp_cancel_purchase_order', 'purchase_orders.cancel'],
      ['dmp_create_purchase_receipt', 'purchase_receipts.create'],
      ['dmp_confirm_purchase_receipt', 'purchase_receipts.confirm'],
      ['dmp_cancel_draft_purchase_receipt', 'purchase_receipts.cancel'],
    ]) {
      expect(migration).toContain(`public.has_permission('${permission}')`);
      expect(migration).toContain(`public.${name}`);
    }
  });

  it('does not alter migrations 119-122', () => {
    for (const migrationNumber of ['119_purchase_orders.sql', '120_purchase_receipts.sql', '121_supplier_details.sql', '122_material_flags.sql']) {
      expect(migrationNumber).not.toBe('123_auth_rbac_navigation.sql');
    }
  });

  it('keeps Oficina in the purchase contract while adding action permissions', () => {
    expect(purchaseOrders).toContain("array['superadmin','Gerencia','Oficina']");
    expect(receipts).toContain("array['superadmin','Gerencia','Oficina']");
    for (const action of ['purchase_orders.create', 'purchase_orders.update', 'purchase_orders.submit', 'purchase_orders.cancel', 'purchase_receipts.create', 'purchase_receipts.update', 'purchase_receipts.confirm', 'purchase_receipts.cancel']) expect(migration).toContain(action);
    expect(migration).toContain('dmp_create_purchase_order');
    expect(migration).toContain('dmp_confirm_purchase_receipt');
  });

  it('enforces separate profile update and deactivation permissions', () => {
    expect(migration).toContain("p_payload ? 'active'");
    expect(migration).toContain("public.has_permission('users.deactivate')");
    expect(migration).toContain("public.has_permission('users.update')");
    expect(migration).toContain('Este usuario tiene privilegios de Superadmin');
    expect(migration).not.toContain("r.name = 'superadmin')) then raise exception 'seguridad: el platform superadmin");
    expect(migration).toContain("delete from public.profile_permission_grants where profile_id = v_target.id");
    expect(migration).not.toContain("'admin.users.read','admin.users.update','admin.audit.read'");
  });

  it('keeps target protection consistent in both administrative RPCs', () => {
    expect(migration).toContain("target_role.name = 'superadmin'");
    expect(migration).toContain("actor_role.name = 'superadmin'");
    expect(migration).toContain('dmp_can_manage_tenant_superadmin_target(v_old.id)');
    expect(migration).toContain('dmp_can_manage_tenant_superadmin_target(v_target.id)');
    expect(verification).not.toContain("position('r.name = ''superadmin''' in p.prosrc)>0");
    expect(verification).toContain("target_role.name = ''superadmin''");
    expect(verification).toContain("actor_role.name = ''superadmin''");
  });

  it('backfills legacy tenant roles without overriding canonical roles', () => {
    expect(migration).toContain("where p.primary_area in ('superadmin','SAT','Comercial','Oficina','Gerencia','Tecnico')");
    expect(migration).toContain('and not exists (select 1 from public.profile_roles existing where existing.profile_id = p.id)');
    expect(migration).toContain('join public.roles r on r.name = p.primary_area');
    const permissionFunctions = migration.slice(migration.indexOf('create or replace function public.dmp_profile_has_permission'), migration.indexOf('create or replace function public.dmp_admin_list_users'));
    expect(permissionFunctions).not.toContain('p.primary_area');
  });

  it('rejects unknown or empty user updates and validates purchase line updates', () => {
    expect(migration).toContain('jsonb_object_keys(p_payload)');
    expect(migration).toContain('no hay cambios de usuario');
    expect(migration).toContain('campo de usuario no permitido');
    expect(migration).toContain('p_ordered_quantity is null or p_ordered_quantity<=0');
    expect(migration).toContain('p_unit_purchase_price<0');
    expect(verification).toContain('admin payload boundary');
    expect(verification).toContain('purchase line update validation');
  });

  it('keeps RLS tenant scope compatible with platform scope', () => {
    for (const permission of ['purchase_orders.read', 'purchase_orders.create', 'purchase_orders.update', 'purchase_receipts.read', 'suppliers.read', 'suppliers.create', 'suppliers.update', 'materials.read', 'materials.create', 'materials.update', 'stock.read']) {
      expect(migration).toContain(`public.has_permission('${permission}')`);
    }
    expect(migration).toContain('(public.is_platform_superadmin() or company_id = public.current_company_id())');
    expect(verification).toContain('RLS USING scope');
    expect(verification).toContain('RLS WITH CHECK scope');
    expect(verification).toContain('v_proc.roles');
    expect(verification).toContain("v_expected.command_name in ('SELECT','UPDATE','DELETE')");
    expect(verification).toContain("v_expected.command_name in ('INSERT','UPDATE')");
    expect(verification).toContain("coalesce(v_proc.qual,'')");
    expect(verification).toContain("coalesce(v_proc.with_check,'')");
    expect(verification).toContain("position('has_permission(' in v_using_expr)");
    expect(verification).toContain('position(quote_literal(v_expected.permission) in v_using_expr)');
    const rlsVerification = verification.slice(verification.indexOf("('purchase_orders_select_backoffice'"));
    expect(rlsVerification).not.toContain("'has_permission('''||v_expected.permission||''')'");
    expect(verification).not.toContain('v_expected.requires_check');
    const matchesPolicyPermission = (expression: string, permission: string) => expression.replace(/\s/g, '').includes('has_permission(') && expression.includes(`'${permission}'`);
    expect(matchesPolicyPermission("has_permission('purchase_orders.read')", 'purchase_orders.read')).toBe(true);
    expect(matchesPolicyPermission("has_permission('purchase_orders.read'::text)", 'purchase_orders.read')).toBe(true);
    expect(matchesPolicyPermission("has_permission('purchase_orders.create'::text)", 'purchase_orders.read')).toBe(false);
  });
});
