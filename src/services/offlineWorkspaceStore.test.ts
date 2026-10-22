import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { offlineWorkspaceStore, readDeviceFirst, setWorkspaceIdentity } from './offlineWorkspaceStore';

beforeEach(() => { setWorkspaceIdentity({ companyId: 'one', profileId: crypto.randomUUID() }); vi.stubGlobal('navigator', { onLine: true }); });
it('opens downloaded work without requesting the network, including after switching away and back', async () => {
  const owner = { companyId: 'one', profileId: crypto.randomUUID() };
  setWorkspaceIdentity(owner);
  await readDeviceFirst('work', async () => ({ title: 'Motor', checks: ['check'] }));
  setWorkspaceIdentity(null); setWorkspaceIdentity(owner);
  vi.stubGlobal('navigator', { onLine: false });
  const network = vi.fn(() => Promise.reject(new Error('network')));
  expect(await readDeviceFirst('work', network)).toEqual({ title: 'Motor', checks: ['check'] });
  expect(network).not.toHaveBeenCalled();
});
it('never exposes another company or another user snapshot', async () => {
  await offlineWorkspaceStore.put('work', { secret: 'customer' });
  setWorkspaceIdentity({ companyId: 'other', profileId: 'other' });
  vi.stubGlobal('navigator', { onLine: false });
  await expect(readDeviceFirst('work', vi.fn())).rejects.toThrow('no está descargado');
});
it('never falls back to a stale copy after an explicit server denial', async () => {
  await offlineWorkspaceStore.put('work', { title: 'Old' });
  await expect(readDeviceFirst('work', async () => { throw new Error('Sin permiso'); }, true)).rejects.toThrow('Sin permiso');
});
it('refuses to save a response that arrives after the identity changes', async () => {
  const network = async () => { setWorkspaceIdentity({ companyId: 'other', profileId: 'other' }); return 'private'; };
  await expect(readDeviceFirst('work', network)).rejects.toThrow('sesión ha cambiado');
  expect(await offlineWorkspaceStore.get('work')).toBeUndefined();
});
it('preserves the old download when refreshing offline fails', async () => {
  await offlineWorkspaceStore.put('work', { title: 'Downloaded' });
  vi.stubGlobal('navigator', { onLine: false });
  await expect(readDeviceFirst('work', vi.fn(), true)).rejects.toThrow('Conecta');
  expect(await readDeviceFirst('work', vi.fn())).toEqual({ title: 'Downloaded' });
});
