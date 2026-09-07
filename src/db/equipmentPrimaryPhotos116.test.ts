import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../supabase/migrations/116_equipment_primary_photos.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('../../supabase/verification/verify_116_equipment_primary_photos.sql', import.meta.url), 'utf8');

describe('116 equipment primary photos', () => {
  it('keeps operational technician access behind the Tecnico role', () => {
    expect(migration).toContain("public.has_any_role(array['Tecnico']) and exists");
    expect(migration).toContain("woa.status not in ('Cancelado','Descargado')");
    expect(migration).toContain("public.has_any_role(array['superadmin','SAT','Gerencia','Oficina','Comercial'])");
  });

  it('validates session, storage metadata and resolved image limits in the RPC', () => {
    expect(migration).toContain("if v_profile_id is null then raise exception 'Sesion no valida'; end if;");
    expect(migration).toContain("so.bucket_id = 'dmp-files' and so.name = v_path and so.owner = auth.uid()");
    expect(migration).toContain("v_storage_metadata->>'mimetype'");
    expect(migration).toContain("v_storage_metadata->>'size'");
    expect(migration).toContain("if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp')");
    expect(migration).toContain("v_size > 10485760");
  });

  it('serializes both primary-photo paths on equipment', () => {
    expect(migration).toContain('where ep.id = p_photo_id\n  for update of e;');
    expect(migration).toContain('where id = (p_payload->>\'equipment_id\')::uuid and deleted_at is null for update;');
  });

  it('postflight checks column, policies, signatures, search path and grants', () => {
    expect(postflight).toContain('pg_attribute');
    expect(postflight).toContain("tablename = 'equipment_photos'");
    expect(postflight).toContain("policyname in ('dmp_files_storage_select','dmp_files_storage_insert','dmp_files_storage_update')");
    expect(postflight).toContain('p.prosecdef');
    expect(postflight).toContain('unnest(coalesce(p.proconfig');
    expect(postflight).toContain('aclexplode(coalesce(t.proacl, acldefault');
    expect(postflight).toContain('count(p.oid) as total_functions_with_name');
    expect(postflight).toContain('p.proargtypes[0]');
    expect(postflight).toContain('pg_get_indexdef');
    expect(postflight).not.toContain('p.proargtypes::oid[]');
    expect(postflight).not.toContain('array_position(ix.indkey');
    expect(postflight).toContain('select_policies');
    expect(postflight).toContain('delete_policies');
    expect(postflight).not.toContain("position('company_id = public.current_company_id()'");
    expect(postflight).not.toContain('pg_get_function_identity_arguments');
    expect(postflight).toContain("p.proname = 'dmp_register_equipment_photo'");
  });
});
