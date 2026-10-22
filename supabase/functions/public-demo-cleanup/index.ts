import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanDemoJob } from '../_shared/demoCleanup.ts';

// Dedicated project guard: this function must never administer the current DMP installation.
const expectedProject = 'https://xlhzyhotzfflemjnqvqn.supabase.co';
const origin = 'https://demo-doormanager-pro.enamarquezf.workers.dev';
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const result = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

Deno.serve(async (request: Request) => {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== origin) return result({ error: 'Origen no permitido' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return result({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleanupSecret = Deno.env.get('DMP_DEMO_CLEANUP_SECRET');
  if (url !== expectedProject || !key || !cleanupSecret) return result({ error: 'Demo pendiente de configuración' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const isScheduled = request.headers.get('x-dmp-demo-cleanup') === cleanupSecret;
  let userId: string | null = null;
  if (!isScheduled) {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return result({ error: 'Sesión requerida' }, 401);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user?.is_anonymous) return result({ error: 'Sesión no válida' }, 401);
    userId = data.user.id;
  }
  const { data: jobs, error } = await admin.rpc('dmp_demo_cleanup_jobs', { p_auth_user_id: userId });
  if (error) return result({ error: 'Limpieza pendiente' }, 503);
  let completed = 0;
  for (const job of jobs ?? []) {
    try { await cleanDemoJob(admin, job); completed += 1; }
    catch {
      await admin.from('dmp_demo_sessions').update({ cleanup_error: 'Pendiente de reintento' }).eq('id', job.id);
    }
  }
  if (isScheduled) {
    const { data: orphans, error: orphanError } = await admin.rpc('dmp_demo_orphan_identities');
    if (orphanError) return result({ error: 'Limpieza de identidades pendiente' }, 503);
    for (const orphan of orphans ?? []) await admin.auth.admin.deleteUser(orphan.id);
  } else if (!jobs?.length && userId) {
    const { data: lease, error: leaseError } = await admin.from('dmp_demo_sessions').select('id').eq('auth_user_id', userId).maybeSingle();
    if (leaseError) return result({ error: 'Identidad pendiente de limpieza' }, 503);
    if (!lease) {
      const { error: userError } = await admin.auth.admin.deleteUser(userId);
      if (userError) return result({ error: 'Identidad pendiente de limpieza' }, 503);
    }
  }
  return result({ completed, pending: (jobs?.length ?? 0) - completed });
});
