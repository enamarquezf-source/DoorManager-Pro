import type { Profile } from '../shared/types';
import { isConnectionFailure } from '../shared/connectionFailure';
import { connectionAvailable } from './offlineWorkspaceStore';

const key = 'dmp-offline-profile-v1';
const maxAge = 7 * 24 * 60 * 60 * 1000;
export function clearOfflineProfile() { localStorage.removeItem(key); }
export async function resolveOfflineProfile(userId: string, load: () => Promise<Profile>): Promise<Profile> {
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved?.profile?.auth_user_id === userId && saved.profile.active && !saved.profile.deleted_at && Date.now() - saved.verifiedAt < maxAge) return saved.profile as Profile;
    } catch { /* A damaged snapshot cannot grant access. */ }
    throw new Error('Conecta para verificar tu sesión y preparar la jornada de este dispositivo.');
  };
  if (!connectionAvailable()) return read();
  try {
    const profile = await load();
    if (profile.auth_user_id !== userId || !profile.active || profile.deleted_at) throw new Error('Usuario desactivado o sesión no válida.');
    localStorage.setItem(key, JSON.stringify({ profile, verifiedAt: Date.now() }));
    return profile;
  } catch (error) {
    if (isConnectionFailure(error)) return read();
    clearOfflineProfile();
    throw error;
  }
}
