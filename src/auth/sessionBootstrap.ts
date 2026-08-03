import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../shared/types';

export type AuthSnapshot = {
  initialized: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
};

export async function loadInitialAuthSnapshot(getSession: () => Promise<{ data: { session: Session | null } }>, getProfile: () => Promise<Profile>): Promise<AuthSnapshot> {
  const session = (await getSession()).data.session;
  if (!session) return { initialized: true, session: null, profile: null, profileError: null };
  try {
    const profile = await getProfile();
    return { initialized: true, session, profile, profileError: null };
  } catch {
    return { initialized: true, session, profile: null, profileError: 'La sesión existe, pero no hay perfil activo enlazado a este usuario Auth.' };
  }
}

export function protectedAuthState(snapshot: AuthSnapshot) {
  if (!snapshot.initialized) return 'loading';
  if (!snapshot.session) return 'redirect-login';
  if (!snapshot.profile) return 'profile-error';
  return 'ready';
}

export function loginAuthState(snapshot: AuthSnapshot) {
  if (!snapshot.initialized) return 'loading';
  if (snapshot.session && snapshot.profile) return 'redirect-app';
  return 'ready';
}
