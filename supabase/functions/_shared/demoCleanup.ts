type DemoJob = { id: string; auth_user_id: string; company_id: string; file_manifest: { bucket: string; path: string }[] };
const buckets = ['dmp-files', 'dmp-documents', 'dmp-invoice-documents', 'dmp-hr'];

async function listFiles(admin: any, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 10) throw new Error('Demo: demasiados niveles de archivos');
  const files: string[] = [];
  // List before deleting so pagination never skips entries after a removal.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error('Demo: no se ha podido enumerar Storage');
    for (const item of data ?? []) {
      if (!item.name || item.name.includes('/') || item.name === '.' || item.name === '..') throw new Error('Demo: ruta no válida');
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else files.push(...await listFiles(admin, bucket, path, depth + 1));
    }
    if ((data?.length ?? 0) < 100) break;
    if (offset > 2000) throw new Error('Demo: límite de archivos por limpieza; revisión necesaria');
  }
  return files;
}

/** Auth and the allowlist are checked by the caller; jobs come only from private SQL. */
export async function cleanDemoJob(admin: any, candidate: DemoJob) {
  const { data, error } = await admin.rpc('dmp_demo_purge', { p_session: candidate.id });
  if (error || !data || data.id !== candidate.id || data.company_id !== candidate.company_id) throw new Error('Demo: no se ha podido preparar la limpieza');
  const job = data as DemoJob;
  const paths = new Map<string, Set<string>>(buckets.map(bucket => [bucket, new Set()]));
  for (const file of job.file_manifest ?? []) {
    if (!paths.has(file.bucket) || !file.path.startsWith(`${job.company_id}/`) || file.path.includes('\\') || file.path.split('/').some(part => part === '..' || part === '.')) throw new Error('Demo: archivo fuera de la sesión; limpieza detenida');
    paths.get(file.bucket)!.add(file.path);
  }
  for (const bucket of buckets) {
    for (const path of await listFiles(admin, bucket, job.company_id)) paths.get(bucket)!.add(path);
    const files = [...paths.get(bucket)!];
    for (let offset = 0; offset < files.length; offset += 100) {
      const { error: removeError } = await admin.storage.from(bucket).remove(files.slice(offset, offset + 100));
      if (removeError) throw new Error('Demo: eliminación de archivos pendiente de reintento');
    }
  }
  const { error: userError } = await admin.auth.admin.deleteUser(job.auth_user_id);
  if (userError && userError.status !== 404 && userError.code !== 'user_not_found') throw new Error('Demo: eliminación de identidad pendiente de reintento');
  const { error: completeError } = await admin.from('dmp_demo_sessions').update({ cleanup_state: 'complete', completed_at: new Date().toISOString(), file_manifest: [], cleanup_error: null }).eq('id', job.id);
  if (completeError) throw new Error('Demo: confirmación de limpieza pendiente');
}
