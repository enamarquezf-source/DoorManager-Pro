import { createContext, useContext } from 'react';
import type { Profile } from '../shared/types';

export function queryAccessScope(profile: Profile | null, userId: string | null) {
  if (!profile?.active || profile.deleted_at || !userId || profile.auth_user_id !== userId) return 'anonymous';
  return JSON.stringify([
    userId, profile.id, profile.company_id,
    [...(profile.roles ?? [])].sort(),
    [...(profile.permission_grants ?? [])].sort(),
    [...(profile.hidden_modules ?? [])].sort(),
  ]);
}

export const QueryAccessContext = createContext('anonymous');
export function useQueryAccessScope() { return useContext(QueryAccessContext); }
