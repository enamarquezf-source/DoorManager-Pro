import { supabase, authStorageKey } from '../lib/supabase/client';
import { queryClient } from '../query/queryClient';
import { clearSignedFileCache } from '../shared/signedFiles';
import { clearOfflineProfile } from '../services/offlineProfile';
import { publicDemoEnabled, parseDemoSession, validDemoRole, type DemoRole } from './model';
let ending: Promise<boolean> | undefined;

function guard() { if (!publicDemoEnabled) throw new Error('La demo solo está disponible en su proyecto independiente.'); }
function friendly(error: any) {
  const message = error?.message ?? '';
  if (message.startsWith('Demo:')) return new Error(message.replace(/^Demo:\s*/, ''));
  if (/anonymous sign-ins.*disabled/i.test(message)) return new Error('El acceso de prueba todavía no está activado.');
  if (/captcha/i.test(message)) return new Error('Repite la comprobación de acceso para empezar.');
  return new Error('No se ha podido preparar la prueba. Comprueba la conexión e inténtalo de nuevo.');
}
async function rpc(name: string, args?: Record<string, any>) {
  guard(); const { data, error } = await supabase.rpc(name, args);
  if (error) throw friendly(error);
  return data;
}
export async function clearDemoDevice() {
  guard();
  await queryClient.cancelQueries(); queryClient.clear(); clearSignedFileCache();
  for (const name of ['dmp-offline-workspace', 'doormanager-pro-tecnico', 'dmp-document-save-attempts']) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      const timer = setTimeout(() => reject(new Error('Cierra las otras pestañas de la demo y vuelve a intentarlo para limpiar los datos locales.')), 5000);
      request.onsuccess = () => { clearTimeout(timer); resolve(); };
      request.onerror = request.onblocked = () => { clearTimeout(timer); reject(new Error('Cierra las otras pestañas de la demo para terminar la limpieza local.')); };
    });
  }
  for (const store of [localStorage, sessionStorage]) {
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index);
      if (key && (/^(?:dmp[-.:]|doormanager)/.test(key) || key === authStorageKey)) store.removeItem(key);
    }
  }
}
export const publicDemoService = {
  async journeysAvailable() { const data = await rpc('dmp_demo_status'); return data?.journeys === 2; },
  async progress() { return await rpc('dmp_demo_progress') as Record<string,number>; },
  async prepareJourney(role: DemoRole) {
    guard();
    if (!navigator.onLine) throw new Error('Conecta para cambiar de perfil. Puedes seguir trabajando sin cobertura en el perfil actual.');
    const current = await publicDemoService.session();
    if (current.role === 'Tecnico' && current.role !== role) {
      const { technicianOfflineService } = await import('../services/technicianOfflineService');
      if ((await technicianOfflineService.pending()).length) throw new Error('Envía los cambios pendientes del técnico antes de cambiar de perfil. Tus datos siguen guardados.');
    }
    await queryClient.cancelQueries();
    const session = parseDemoSession(await rpc('dmp_demo_prepare_journey', {p_role:role}));
    queryClient.clear(); clearSignedFileCache(); clearOfflineProfile();
    return session;
  },
  async ready() { const data = await rpc('dmp_demo_status'); return data?.ready === true && data?.version === 1 && data?.journeys === 2; },
  async session() { return parseDemoSession(await rpc('dmp_demo_session')); },
  async heartbeat() { return parseDemoSession(await rpc('dmp_demo_heartbeat')); },
  async start(role: DemoRole, captchaToken: string) {
    guard(); if (!validDemoRole(role) || !captchaToken) throw new Error('Selecciona un rol y completa la comprobación de acceso.');
    if (ending) await ending;
    if (!await publicDemoService.ready()) throw new Error('Estamos preparando la demostración. Vuelve a intentarlo más adelante.');
    const { data: current, error: currentError } = await supabase.auth.getSession();
    if (currentError) throw friendly(currentError);
    if (current.session) {
      const existing = await publicDemoService.session().catch(() => null);
      if (existing && !existing.ended && Date.parse(existing.expires_at) > Date.now()) {
        if (existing.role !== role) throw new Error('Finaliza tu prueba actual antes de elegir otro rol.');
        return existing;
      }
      await publicDemoService.end();
    } else await clearDemoDevice();
    const { error: authError } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    if (authError) throw friendly(authError);
    return parseDemoSession(await rpc('dmp_demo_start', { p_role: role }));
  },
  end(): Promise<boolean> {
    guard();
    ending ??= finishDemo().finally(() => { ending = undefined; });
    return ending;
  },
};
async function finishDemo() {
    let complete = false;
    try {
      await rpc('dmp_demo_finish');
      const { data, error } = await supabase.functions.invoke('public-demo-cleanup', { body: {} });
      complete = !error && data?.pending === 0;
    } catch { /* The server job retries expiry/cleanup even if the browser disconnects. */ }
    // Local sign-out works after the cleanup function has removed the Auth user.
    await supabase.auth.signOut({ scope: 'local' });
    await clearDemoDevice();
    sessionStorage.setItem('dmp-demo-end-status', complete ? 'complete' : 'pending');
    return complete;
}
