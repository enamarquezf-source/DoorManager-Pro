import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('material import pgcrypto hotfix 135', () => {
  it('redefines only the import RPC and leaves migration 134 immutable', () => {
    const migration = readFileSync('supabase/migrations/135_material_import_pgcrypto_hotfix.sql', 'utf8');
    const previous = readFileSync('supabase/migrations/134_material_import_transfer.sql', 'utf8');
    expect(previous).toContain('public.digest(');
    expect(migration).toContain('create or replace function public.dmp_import_material_stock(p_payload jsonb)');
    expect(migration).toContain('extensions.digest(');
    expect(migration).not.toContain('public.digest(');
    expect(migration).toContain('security definer set search_path = public');
    expect(migration).not.toContain('dmp_transfer_warehouse_stock');
    expect(migration).not.toContain('create table');
    expect(migration).not.toContain('alter table');
    expect(migration).not.toContain('create index');
  });

  it('keeps the applied import contract in the hotfix definition', () => {
    const migration = readFileSync('supabase/migrations/135_material_import_pgcrypto_hotfix.sql', 'utf8');
    expect(migration).toContain("status, created_by");
    expect(migration).toContain('dmp_adjust_warehouse_stock');
    expect(migration).toContain('if not found or v_movement is null');
    expect(migration).toContain("'unit', nullif(trim(item.unit), '')");
    expect(migration).not.toContain('materials.stock_quantity');
  });
});
