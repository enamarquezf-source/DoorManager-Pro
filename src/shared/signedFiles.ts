import { supabase } from '../lib/supabase/client';

export const filesBucket = 'dmp-files';

const signedUrlCache = new Map<string, { url: string | null; expiresAt: number }>();

export function fileReference(row: Record<string, any>) {
  return {
    bucket: row.files?.bucket ?? row.bucket ?? filesBucket,
    path: row.files?.path ?? row.path ?? row.file_path ?? row.storage_path ?? null,
  };
}

export async function signedFileUrl(bucket: string, path?: string | null, expiresIn = 600) {
  if (!path) return null;
  const key = `${bucket}\u0000${path}\u0000${expiresIn}`;
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new Error('No se ha podido generar el acceso temporal al archivo.');
  const url = data?.signedUrl ?? null;
  signedUrlCache.set(key, { url, expiresAt: Date.now() + Math.max(1, expiresIn - 30) * 1000 });
  return url;
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
