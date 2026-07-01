import { supabase } from '../lib/supabase/client';

export async function expectData<T>(query: PromiseLike<{ data: T | null; error: any }>) {
  const { data, error } = await query;
  if (error) {
    if (import.meta.env.DEV) console.error('Supabase error', error);
    throw new Error(toSpanishSupabaseError(error));
  }
  return data as T;
}

export function toSpanishSupabaseError(error: any) {
  const message = error?.message ?? String(error ?? '');
  if (message.includes('more than one relationship')) return 'Error al cargar datos relacionados. Hay una relación ambigua en la consulta de Supabase.';
  if (message.includes('permission denied') || message.includes('row-level security')) return 'No tienes permisos para realizar esta operación con tu rol actual.';
  if (message.includes('duplicate key')) return 'Ya existe un registro con esos datos.';
  if (message.includes('violates foreign key')) return 'El registro relacionado seleccionado no existe o no pertenece a tu empresa.';
  return error?.message ? `Error de Supabase: ${error.message}` : 'Error de Supabase.';
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
