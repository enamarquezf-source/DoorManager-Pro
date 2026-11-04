// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { createAuthStorage } from './authStorage';
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
const key = 'sb-project-auth-token';

it('keeps Pro credentials in the tab and removes only its legacy persistent token', () => {
  localStorage.setItem(key, 'old-login');
  localStorage.setItem('dmp-offline-profile-v1', 'downloaded-profile');
  const storage = createAuthStorage(false, key);
  expect(storage.getItem(key)).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
  storage.setItem(key, 'tab-login');
  expect(sessionStorage.getItem(key)).toBe('tab-login');
  expect(createAuthStorage(false, key).getItem(key)).toBe('tab-login');
  expect(localStorage.getItem('dmp-offline-profile-v1')).toBe('downloaded-profile');
});

it('does not restore Pro login into a tab with empty session storage', () => {
  const tab = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } }; };
  const first = createAuthStorage(false, key, { localStorage, sessionStorage: tab() });
  first.setItem(key, 'first-tab-token');
  const second = createAuthStorage(false, key, { localStorage, sessionStorage: tab() });
  expect(second.getItem(key)).toBeNull();
  expect(first.getItem(key)).toBe('first-tab-token');
});

it('preserves the passwordless demo visitor across tabs', () => {
  const storage = createAuthStorage(true, key);
  storage.setItem(key, 'anonymous-visitor');
  expect(createAuthStorage(true, key).getItem(key)).toBe('anonymous-visitor');
  expect(localStorage.getItem(key)).toBe('anonymous-visitor');
});

it('uses memory instead of persistent login if tab storage is unavailable', () => {
  const browser = { localStorage, get sessionStorage(): Storage { throw new Error('blocked'); } };
  const storage = createAuthStorage(false, key, browser);
  storage.setItem(key, 'memory-only');
  expect(storage.getItem(key)).toBe('memory-only');
  expect(localStorage.getItem(key)).toBeNull();
});
