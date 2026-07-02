import { supabase } from '../lib/supabase/client';

export const authService = {
  getSession() {
    return supabase.auth.getSession();
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
