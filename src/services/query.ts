import { supabase } from '../lib/supabase/client';

type QueryContext = { service: string; operation: string; resource?: string };

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
    throw new Error(`${prefix}${toSpanishSupabaseError(error)}`);
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
  if (message.includes('more than one relationship')) return 'Error al cargar datos relacionados. Hay una relación ambigua en la consulta de Supabase.';
  if (message.includes('permission denied') || message.includes('row-level security')) return 'No tienes permisos para realizar esta operación con tu rol actual.';
  if (message.includes('JWT') || message.includes('auth')) return 'Tu sesión no permite realizar esta operación. Vuelve a iniciar sesión si el problema continúa.';
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch failed')) return 'No hay conexión con Supabase. Revisa la red e inténtalo de nuevo.';
  if (message.includes('No se ha encontrado')) return message;
  if (/^(respuesta de Supabase|validacion del formulario|permiso|perfil activo|empresa|asignacion|parte|estado editable|insercion):/i.test(message)) return message;
  if (message.includes('duplicate key')) return 'Ya existe un registro con esos datos.';
  if (message.includes('violates foreign key')) return 'El registro relacionado seleccionado no existe o no pertenece a tu empresa.';
  if (message.includes('null value') && message.includes('code')) return 'No se ha podido generar el código automático. Inténtalo de nuevo.';
  if (message.includes('not-null')) return 'Falta un dato obligatorio para guardar el registro.';
  return 'No se ha podido completar la operación. Revisa los datos e inténtalo de nuevo.';
}

export async function currentCompanyId() {
  const { data, error } = await supabase.rpc('current_company_id');
  if (error) throw new Error(error.message);
  if (!data) throw new Error('El usuario autenticado no tiene perfil enlazado a una empresa.');
  return data as string;
}

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
