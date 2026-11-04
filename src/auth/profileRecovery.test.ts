import { expect, it, vi } from 'vitest';
import { loadInitialAuthSnapshot } from './sessionBootstrap';
import { verifyProfile } from './profileRecovery';

it('recovers a temporary verification failure without logging the user out', async () => {
  const session = { user: { id: 'user' } } as any;
  const profile = { id: 'profile', auth_user_id: 'user', roles: ['SAT'] } as any;
  const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(profile);
  const result = await loadInitialAuthSnapshot(async () => ({ data: { session } }), load);
  expect(load).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ initialized: true, session, profile, profileError: null });
});

it('does not label a persistent connection failure as a missing profile', async () => {
  const session = { user: { id: 'user' } } as any;
  const result = await loadInitialAuthSnapshot(async () => ({ data: { session } }), async () => { throw new TypeError('Failed to fetch'); });
  expect(result.session).toBe(session);
  expect(result.profile).toBeNull();
  expect(result.profileError).toContain('comprobar tus permisos');
  expect(result.profileError).not.toContain('no hay perfil');
});

it('does not retry or override a confirmed deactivation', async () => {
  const load = vi.fn(async () => { throw new Error('Usuario desactivado'); });
  await expect(verifyProfile(load)).rejects.toThrow('desactivado');
  expect(load).toHaveBeenCalledOnce();
});
