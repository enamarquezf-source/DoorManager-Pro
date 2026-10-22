import type { Session } from '@supabase/supabase-js';
import { supabase, authStorageKey } from '../lib/supabase/client';
import { isConnectionFailure } from '../shared/connectionFailure';

function storedSession() {
  try { const session = JSON.parse(localStorage.getItem(authStorageKey) ?? 'null'); return { data: { session: session?.user?.id ? session as Session : null }, error: null }; }
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
    return supabase.auth.onAuthStateChange(callback);
  },
  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },
  signOut() {
    return supabase.auth.signOut();
  },
};
