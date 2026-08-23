import { describe, expect, it } from 'vitest';
import { SupabaseOperationError, toSpanishSupabaseError } from './query';

describe('query error mapping', () => {
  it('muestra errores de operación no disponible sin detalles técnicos en UI', () => {
    const message = 'Could not find the function public.dmp_update_work_order_operational_fields(p_payload, p_work_order_id) in the schema cache';

    expect(toSpanishSupabaseError({ message })).toContain('Esta operación no está disponible ahora mismo');
    expect(toSpanishSupabaseError({ message })).not.toContain('dmp_update_work_order_operational_fields');
    expect(toSpanishSupabaseError({ message })).not.toContain('migracion pendiente');
  });

  it('conserva metadatos seguros del error original de Supabase', () => {
    const error = new SupabaseOperationError('Operacion fallida', { code: '23514', details: 'Constraint audit_log_operation_check', hint: 'Permite OPERATIONAL_UPDATE' });

    expect(error).toMatchObject({ name: 'SupabaseOperationError', code: '23514', details: 'Constraint audit_log_operation_check', hint: 'Permite OPERATIONAL_UPDATE' });
  });

  it('conserva el diagnóstico funcional de tarifas sin exponer detalles internos', () => {
    expect(toSpanishSupabaseError({ message: 'tarifa: no existe una tarifa horaria vigente aplicable al tecnico para la fecha indicada' })).toBe('tarifa: no existe una tarifa horaria vigente aplicable al tecnico para la fecha indicada');
  });
});
