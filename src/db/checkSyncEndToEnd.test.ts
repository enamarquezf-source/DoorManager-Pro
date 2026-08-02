import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import pgQuery from 'pg-query-emscripten';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/020_check_sync_end_to_end.sql'), 'utf8');

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
});
