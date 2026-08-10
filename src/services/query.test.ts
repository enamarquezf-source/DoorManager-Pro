import { describe, expect, it } from 'vitest';
import { toSpanishSupabaseError } from './query';

describe('query error mapping', () => {
  it('no oculta errores de RPC no disponible o migracion pendiente', () => {
    const message = 'Could not find the function public.dmp_update_work_order_operational_fields(p_payload, p_work_order_id) in the schema cache';

    expect(toSpanishSupabaseError({ message })).toContain('dmp_update_work_order_operational_fields');
    expect(toSpanishSupabaseError({ message })).toContain('migracion pendiente');
  });
});
