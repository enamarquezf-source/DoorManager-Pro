import { supabase } from '../lib/supabase/client';

type QueryContext = { service: string; operation: string; resource?: string };

export class SupabaseOperationError extends Error {
  code?: string;
  details?: string;
  hint?: string;
  originalError: any;

  constructor(message: string, error: any) {
    super(message);
    this.name = 'SupabaseOperationError';
    this.code = error?.code;
    this.details = error?.details;
    this.hint = error?.hint;
    this.originalError = error;
  }
}

export async function expectData<T>(query: PromiseLike<{ data: T | null; error: any }>, context?: QueryContext | string) {
  const { data, error } = await query;
  if (error) {
    const safeContext: QueryContext | undefined = typeof context === 'string' ? { service: 'supabase', operation: context } : context;
    console.error('Supabase query error', {
      service: safeContext?.service,
      operation: safeContext?.operation,
      resource: safeContext?.resource,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    const prefix = safeContext?.operation ? `${safeContext.operation}: ` : '';
    throw new SupabaseOperationError(`${prefix}${toSpanishSupabaseError(error)}`, error);
  }
  return data as T;
}

export async function expectStep<T>(operation: string, loader: () => Promise<T>) {
  try {
    return await loader();
  } catch (error) {
    throw new Error(error instanceof Error ? `${operation}: ${error.message}` : `${operation}: error inesperado`);
  }
}

export function toSpanishSupabaseError(error: any) {
  const message = error?.message ?? String(error ?? '');
  if (message.includes('more than one relationship')) return 'No se han podido cargar los datos relacionados. Reinténtalo o avisa a administración.';
  if (message.includes('permission denied') || message.includes('row-level security')) return 'No tienes permisos para realizar esta operación con tu rol actual.';
  if (message.includes('JWT') || message.includes('auth')) return 'Tu sesión no permite realizar esta operación. Vuelve a iniciar sesión si el problema continúa.';
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch failed')) return 'No hay conexión. Revisa la red e inténtalo de nuevo.';
  if (error?.code === 'PGRST202' || message.includes('Could not find the function') || message.includes('function') && message.includes('does not exist')) {
    if (message.includes('create_work_order_full')) return 'La API no encuentra la firma esperada de create_work_order_full.';
    return 'Esta operación no está disponible ahora mismo. Reinténtalo o avisa a administración.';
  }
  if (message.includes('schema cache')) return 'Los datos no están disponibles todavía. Reinténtalo en unos segundos.';
  if (message.includes('No se ha encontrado')) return message;
  if (message.includes('audit_log_operation_check')) return 'No se ha podido registrar la operación. Reinténtalo o avisa a administración.';
  if (message.includes('violates check constraint')) return 'Los datos no cumplen una regla de validación. Revisa la información introducida.';
  if (/^respuesta de Supabase:/i.test(message)) return message.replace(/^respuesta de Supabase:\s*/i, '');
  if (/^(validacion del formulario|purga|permiso|perfil activo|empresa|asignacion|parte|estado editable|insercion|adicional|tarifa):/i.test(message)) return message;
  if (message.includes('duplicate key')) return 'Ya existe un registro con esos datos.';
  if (message.includes('violates foreign key')) return 'El registro relacionado seleccionado no existe o no pertenece a tu empresa.';
  if (message.includes('null value') && message.includes('code')) return 'No se ha podido generar el código automático. Inténtalo de nuevo.';
  if (message.includes('not-null')) return 'Falta un dato obligatorio para guardar el registro.';
  return 'No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.';
}

export async function operatingCompanyId() {
  const { data, error } = await supabase.rpc('dmp_operating_company_id');
  if (error) {
    console.error('DMP operating company resolution failed', { message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
    throw new Error('No se ha podido determinar la empresa de DoorManager. Revisa la configuración de empresa operadora.');
  }
  if (!data) throw new Error('No hay una empresa operadora activa configurada.');
  return data as string;
}

export async function currentProfileCompanyId() {
  const { data, error } = await supabase.rpc('current_company_id');
  if (error) {
    console.error('DMP profile company resolution failed', { message: error?.message, details: error?.details, hint: error?.hint, code: error?.code, name: error?.name });
    throw new Error('No se ha podido determinar la empresa del perfil autenticado.');
  }
  if (!data) throw new Error('El usuario autenticado no tiene una empresa operativa válida.');
  return data as string;
}

// Compatibility alias: existing CRUD services still use the single-company runtime contract.
export const currentCompanyId = operatingCompanyId;

export async function currentProfileId() {
  const { data, error } = await supabase.rpc('current_profile_id');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('El usuario autenticado no tiene perfil enlazado.');
  return data as string;
}

export function contains(columns: string[], value: string) {
  const term = `%${value.replaceAll('%', '')}%`;
  return columns.map((column) => `${column}.ilike.${term}`).join(',');
}
