import { describe, expect, it } from 'vitest';
import { SupabaseOperationError, toSpanishSupabaseError } from './query';

describe('query error mapping', () => {
  it('no oculta errores de RPC no disponible o migracion pendiente', () => {
    const message = 'Could not find the function public.dmp_update_work_order_operational_fields(p_payload, p_work_order_id) in the schema cache';

    expect(toSpanishSupabaseError({ message })).toContain('dmp_update_work_order_operational_fields');
    expect(toSpanishSupabaseError({ message })).toContain('migracion pendiente');
  });

  it('conserva metadatos seguros del error original de Supabase', () => {
    const error = new SupabaseOperationError('Operacion fallida', { code: '23514', details: 'Constraint audit_log_operation_check', hint: 'Permite OPERATIONAL_UPDATE' });

    expect(error).toMatchObject({ name: 'SupabaseOperationError', code: '23514', details: 'Constraint audit_log_operation_check', hint: 'Permite OPERATIONAL_UPDATE' });
  });
});
