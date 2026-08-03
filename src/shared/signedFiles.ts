import { supabase } from '../lib/supabase/client';

export const filesBucket = 'dmp-files';

export function fileReference(row: Record<string, any>) {
  return {
    bucket: row.files?.bucket ?? row.bucket ?? filesBucket,
    path: row.files?.path ?? row.path ?? row.file_path ?? row.storage_path ?? null,
  };
}

export async function signedFileUrl(bucket: string, path?: string | null, expiresIn = 600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new Error('No se ha podido generar el acceso temporal al archivo.');
  return data?.signedUrl ?? null;
}

export async function withSignedFileUrl<T extends Record<string, any>>(row: T) {
  const { bucket, path } = fileReference(row);
  if (!path) return { ...row, signed_url: null, file_error: 'No se ha podido cargar el archivo' };
  try {
    return { ...row, signed_url: await signedFileUrl(bucket, path), file_error: null };
  } catch {
    return { ...row, signed_url: null, file_error: 'No se ha podido cargar el archivo' };
  }
}
