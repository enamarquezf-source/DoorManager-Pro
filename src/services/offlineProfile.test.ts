// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
import { resolveOfflineProfile, clearOfflineProfile } from './offlineProfile';
const profile = { id: 'profile', company_id: 'company', auth_user_id: 'user', active: true, roles: ['Tecnico'] } as any;
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });
it('restores only a previously verified profile belonging to the same signed-in user', async () => {
  await resolveOfflineProfile('user', async () => profile);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const network = vi.fn();
  expect(await resolveOfflineProfile('user', network)).toEqual(profile);
  expect(network).not.toHaveBeenCalled();
  await expect(resolveOfflineProfile('other', network)).rejects.toThrow('Conecta');
});
it('requires verification after seven days and removes the profile on logout', async () => {
  await resolveOfflineProfile('user', async () => profile);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 86400000);
  await expect(resolveOfflineProfile('user', vi.fn())).rejects.toThrow('Conecta');
  clearOfflineProfile();
  expect(localStorage.getItem('dmp-offline-profile-v1')).toBeNull();
});
it('does not convert a deactivated profile into offline access', async () => {
  await resolveOfflineProfile('user', async () => profile);
  await expect(resolveOfflineProfile('user', async () => { throw new Error('Usuario desactivado'); })).rejects.toThrow('desactivado');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await expect(resolveOfflineProfile('user', vi.fn())).rejects.toThrow('Conecta');
});
