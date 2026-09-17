import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('material import and transfer migration 134', () => {
  it('keeps import and transfer transactional behind RPCs', () => {
    const migration = readFileSync('supabase/migrations/134_material_import_transfer.sql', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    const service = readFileSync('src/services/materialsService.ts', 'utf8');
    expect(migration).toContain('dmp_import_material_stock');
    expect(migration).toContain('dmp_transfer_warehouse_stock');
    expect(migration).toContain('for update');
    expect(migration).toContain("movement_type, quantity");
    expect(app).toContain('MaterialMigrationPanel');
    expect(service).toContain("supabase.rpc('dmp_transfer_warehouse_stock'");
  });

  it('covers the literal idempotency and stock-safety contract', () => {
    const migration = readFileSync('supabase/migrations/134_material_import_transfer.sql', 'utf8');
    const verification = readFileSync('supabase/verification/verify_134_material_import_transfer.sql', 'utf8');
    expect(migration).not.toContain('LIKE');
    expect(migration).toContain('material_import_batches');
    expect(migration).toContain('payload_fingerprint');
    expect(migration).toContain('public.digest(');
    expect(migration).toContain('created_by uuid not null references public.profiles(id)');
    expect(migration).toContain('if not found or v_movement is null');
    expect(migration).toContain("if v_source.quantity < p_quantity then");
    expect(migration).not.toContain('allow_negative_stock');
    expect(migration).toContain("raise exception 'conflicto: transferencia previa incompleta'");
    expect(migration).toContain('v_existing_out.id is not null and v_existing_in.id is null');
    expect(migration).toContain('v_existing_out.id is null and v_existing_in.id is not null');
    expect(migration).toContain('transfer_group_id');
    expect(verification).not.toContain('Validate the complete payload before creating or updating anything.');
    expect(verification).toContain("'batch schema contract'");
    expect(verification).toContain("'materials case-insensitive unique code index'");
    expect(verification).toContain("'transfer_group column and index'");
    expect(verification).toContain("'pgcrypto digest namespace and RPC reference'");
    expect(verification).toContain("'transfer both partial states are rejected'");
    expect(verification).toContain("'canonical import movement is mandatory'");
    expect(verification).toContain("'import fingerprint preserves unit semantics'");
    expect(verification).toContain("to_regprocedure('public.dmp_import_material_stock(jsonb)')");
    expect(verification).toContain("to_regprocedure('public.dmp_transfer_warehouse_stock(uuid,uuid,uuid,numeric,text,text)')");
    expect(verification).toContain("to_regprocedure('public.digest(bytea,text)')");
    expect(verification).not.toContain('pg_get_function_identity_arguments');
    expect(verification).toContain("'SUMMARY'");
    expect(verification).toContain("'materials stock_quantity absent'");
  });

  it('keeps missing unit distinct from an explicit ud unit', () => {
    const migration = readFileSync('supabase/migrations/134_material_import_transfer.sql', 'utf8');
    const canonicalUnit = (unit: string | undefined) => unit?.trim() || null;
    const fingerprintPayload = (unit: string | undefined) => JSON.stringify({ code: 'MAT-1', description: 'Material', unit: canonicalUnit(unit), quantity: 1 });
    expect(canonicalUnit(undefined)).toBeNull();
    expect(canonicalUnit('')).toBeNull();
    expect(canonicalUnit('ud')).toBe('ud');
    expect(canonicalUnit(undefined)).not.toBe(canonicalUnit('ud'));
    expect(fingerprintPayload(undefined)).toBe(fingerprintPayload(''));
    expect(fingerprintPayload(undefined)).not.toBe(fingerprintPayload('ud'));
    expect(migration).toContain("'unit', nullif(trim(item.unit), '')");
    expect(migration).toContain("status text not null default 'pending'");
    expect(migration).toContain("conflicto: la clave idempotente ya se uso para otra importacion");
    expect(migration).not.toContain("'unit', coalesce(nullif(trim(item.unit), ''), 'ud')");
  });
});
