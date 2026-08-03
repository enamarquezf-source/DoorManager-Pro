import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const preflightMigration = readFileSync(resolve(migrationsDir, '018_preflight_reconcile_dependencies.sql'), 'utf8');
const rpcReconcileMigration = readFileSync(resolve(migrationsDir, '018_rpc_reconcile_missing_frontend_functions.sql'), 'utf8');
const auditMigration = readFileSync(resolve(migrationsDir, '019_audit_functional_stabilization.sql'), 'utf8');
const migration = readFileSync(resolve(migrationsDir, '020_check_sync_end_to_end.sql'), 'utf8');
const verification = readFileSync(resolve(process.cwd(), 'supabase/verification/verify_preflight_dependencies.sql'), 'utf8');
const managementPermissionsMigration = readFileSync(resolve(migrationsDir, '016_align_management_permissions.sql'), 'utf8');
const platformSuperadminMigration = readFileSync(resolve(migrationsDir, '017_platform_superadmin_global_scope.sql'), 'utf8');

describe('check sync end-to-end migration 020', () => {
  it('no usa policies globales de Storage solo por bucket', () => {
    expect(migration).not.toContain("using (bucket_id = 'dmp-files')");
    expect(migration).not.toContain("with check (bucket_id = 'dmp-files')");
    expect(migration).toContain('public.can_read_dmp_storage_object(name)');
    expect(migration).toContain('public.can_write_dmp_storage_object(name)');
  });

  it('aisla Storage por company_id y recurso en la ruta', () => {
    expect(migration).toContain("v_company_id <> public.current_company_id()");
    expect(migration).toContain("p_company_id::text || '/' || p_type || '/' || p_resource_id::text || '/%'");
    expect(migration).toContain("public.assert_dmp_storage_path(p_payload->>'path', v_check.company_id, 'checks', v_check.id)");
    expect(migration).toContain("public.assert_dmp_storage_path(p_payload->>'path', v_work.company_id, 'work-orders', v_work.id)");
  });

  it('impide tecnico no asignado en Storage y RPC', () => {
    expect(migration).toContain('ch.technician_id = public.current_profile_id() or public.is_assigned_to_work_order');
    expect(migration).toContain('public.is_assigned_to_work_order(v_work.id, v_profile_id)');
    expect(migration).toContain('No tienes permisos para adjuntar fotos a este check');
    expect(migration).toContain('No tienes permisos para firmar este parte');
  });

  it('calcula finalizacion desde resultados remotos y no confia en frontend', () => {
    expect(migration).toContain('create or replace function public.finish_check_safe(p_check_id uuid, p_observations text default null)');
    expect(migration).not.toContain('p_global_result');
    expect(migration).toContain("when exists (select 1 from public.check_section_results where check_id = v_check.id and result = 'No favorable') then 'No favorable'");
    expect(migration).toContain('No se puede finalizar: hay secciones sin sincronizar');
  });

  it('usa funcion nueva de material offline sin redeclarar record_work_order_material_usage', () => {
    expect(migration).not.toContain('create or replace function public.record_work_order_material_usage(');
    expect(migration).toContain('create or replace function public.sync_work_order_material_usage');
  });

  it('tiene bloques dollar-quote balanceados como validacion sintactica basica', () => {
    expect((migration.match(/\$\$/g) ?? []).length % 2).toBe(0);
    expect(migration).not.toMatch(/create policy dmp_files_storage_(select|insert|update).*bucket_id = 'dmp-files'\s*\)/i);
  });

  it('parsea la migracion 020 con parser PostgreSQL', async () => {
    const parser = await pgQuery();
    const parsed = parser.parse(migration);
    expect(parsed.error).toBeNull();
    expect(parsed.parse_tree.stmts.length).toBeGreaterThan(20);
  });

  it('parsea sintacticamente preflight, reconciliacion RPC, 019 y 020', async () => {
    const parser = await pgQuery();
    for (const sql of [preflightMigration, rpcReconcileMigration, auditMigration, migration]) {
      const parsed = parser.parse(sql);
      expect(parsed.error).toBeNull();
      expect(parsed.parse_tree.stmts.length).toBeGreaterThan(0);
    }
  });

  it('reconcilia todas las dependencias directas necesarias para 019 y 020', () => {
    for (const signature of [
      'create or replace function public.is_company_member(p_company_id uuid)',
      'p.auth_user_id = auth.uid()',
      'p.company_id = p_company_id',
      'create or replace function public.has_any_role(role_names text[])',
      'create or replace function public.is_assigned_to_work_order(',
      'p_profile_id uuid default public.current_profile_id()',
      'create or replace function public.next_dmp_code(',
      'p_company_id uuid,',
      'p_table_name text,',
      'p_prefix text,',
      'p_yearly boolean default false,',
      'p_width integer default 6',
    ]) expect(preflightMigration).toContain(signature);
    expect(preflightMigration).toContain('grant execute on function public.is_company_member(uuid) to authenticated');
    expect(platformSuperadminMigration).toContain('not public.is_company_member(p_company_id)');
    expect(verification).toContain("('is_company_member', 'public.is_company_member(uuid)', 'uuid')");
    expect(verification).toContain("('has_any_role', 'public.has_any_role(text[])', 'text[]')");
    expect(verification).toContain("('is_assigned_to_work_order', 'public.is_assigned_to_work_order(uuid, uuid)', 'uuid, uuid')");
    expect(verification).toContain("('next_dmp_code', 'public.next_dmp_code(uuid, text, text, boolean, integer)', 'uuid, text, text, boolean, integer')");
    expect(verification).toContain('oidvectortypes(p.proargtypes) = r.argument_types');
  });

  it('mantiene permisos reales para crear clientes y generar codigos', () => {
    expect(managementPermissionsMigration).toContain("with check (company_id = public.current_company_id() and public.has_any_role(array['superadmin','SAT','Comercial']))");
    expect(managementPermissionsMigration).not.toContain("public.has_any_role(array['superadmin','SAT','Comercial','Gerencia'])");
    expect(platformSuperadminMigration).toContain("'profiles', 'clients', 'client_contacts', 'sites', 'site_contacts'");
    expect(platformSuperadminMigration).toContain('with check (public.is_platform_superadmin())');
    expect(preflightMigration).toContain('perform public.assert_member_of_current_company(p_company_id);');
    expect(preflightMigration).toContain("p_table_name <> all(array['clients','sites','equipment','cases','work_orders','checks','alerts','deficiencies','materials','warehouses','opportunities','quotes'])");
  });

  it('reconcilia RPC de frontend con validaciones y grants acotados', () => {
    for (const signature of [
      'create or replace function public.create_case(',
      'create or replace function public.create_work_order_full(p_payload jsonb)',
      'create or replace function public.save_check_block_result(p_payload jsonb)',
      'create or replace function public.superadmin_create_profile(p_profile jsonb)',
      'create function public.technician_global_search(p_query text)',
      'create or replace function public.unassign_work_order_profile(',
      'create or replace function public.assign_commercial_work_order(',
      'set search_path = public',
      'perform public.assert_member_of_current_company',
      'public.is_platform_superadmin()',
      'revoke all on function public.create_case',
      'grant execute on function public.technician_global_search(text) to authenticated',
    ]) expect(rpcReconcileMigration).toContain(signature);
  });

  it('no vuelve a usar public.is_superadmin() en 019/020/preflight', () => {
    expect(preflightMigration).not.toContain('public.is_superadmin()');
    expect(auditMigration).not.toContain('public.is_superadmin()');
    expect(migration).not.toContain('public.is_superadmin()');
    expect(auditMigration).toContain('public.is_platform_superadmin()');
    expect(auditMigration).toContain('for update to authenticated using');
  });

  it('documenta el orden requerido de aplicacion de migraciones funcionales', () => {
    const requiredOrder = ['018_preflight_reconcile_dependencies.sql', '018_rpc_reconcile_missing_frontend_functions.sql', '019_audit_functional_stabilization.sql', '020_check_sync_end_to_end.sql'];
    const present = readdirSync(migrationsDir).filter((file) => requiredOrder.includes(file));
    expect(present.sort((a, b) => requiredOrder.indexOf(a) - requiredOrder.indexOf(b))).toEqual(requiredOrder);
    expect(readdirSync(migrationsDir)).not.toContain('019_preflight_reconcile_dependencies.sql');
  });
});
