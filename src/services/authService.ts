import type { Session } from '@supabase/supabase-js';
import { supabase, authStorageKey, authStorage } from '../lib/supabase/client';
import { isConnectionFailure } from '../shared/connectionFailure';
import { publicDemoEnabled } from '../demo/model';

function storedSession() {
  try { const session = JSON.parse(authStorage.getItem(authStorageKey) ?? 'null'); return { data: { session: session?.user?.id ? session as Session : null }, error: null }; }
  catch { return { data: { session: null }, error: null }; }
}

export const authService = {
  async getSession() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return storedSession();
    try {
      const response = await supabase.auth.getSession();
      return response.error && isConnectionFailure(response.error) ? storedSession() : response;
    } catch (error) {
      if (isConnectionFailure(error)) return storedSession();
      throw error;
    }
  },
  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    // Supabase awaits subscribers while holding its auth lock. Profile loading
    // calls getUser(), so it must start in a later task, after that lock releases.
    let active = true;
    const tasks = new Set<ReturnType<typeof setTimeout>>();
    const result = supabase.auth.onAuthStateChange((event, session) => {
      // Pro uses tab-scoped credentials. Ignore auth broadcasts from another
      // tab/account; they must not replace this tab's validated identity.
      if (!publicDemoEnabled && (storedSession().data.session?.user?.id ?? null) !== (session?.user?.id ?? null)) return;
      const task = setTimeout(() => {
        tasks.delete(task);
        if (active) void Promise.resolve().then(() => callback(event, session)).catch(() => {
          console.error('[DMP] No se ha podido procesar el cambio de sesión.');
        });
      }, 0);
      tasks.add(task);
    });
    return { data: { subscription: { ...result.data.subscription, unsubscribe() {
      active = false;
      for (const task of tasks) clearTimeout(task);
      tasks.clear();
      result.data.subscription.unsubscribe();
    } } } };
  },
  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },
  signOut() {
    return supabase.auth.signOut();
  },
};
