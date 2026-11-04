// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authService } from './authService';
const mock = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), saved: null as any }));
vi.mock('../lib/supabase/client', () => ({ authStorageKey: 'test-auth', authStorage: { getItem: () => JSON.stringify(mock.saved) }, supabase: { auth: { onAuthStateChange: mock.subscribe } } }));
beforeEach(() => { mock.saved = { user: { id: 'visitor' } }; });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('releases the auth callback before a subscriber can request the profile', async () => {
  vi.useFakeTimers();
  let notify!: (event: any, session: any) => unknown;
  let locked = true;
  mock.subscribe.mockImplementation(callback => { notify = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; });
  const profile = vi.fn(async () => { expect(locked).toBe(false); });
  const subscription = authService.onAuthStateChange(profile);
  expect(notify('TOKEN_REFRESHED', { user: { id: 'visitor' } })).toBeUndefined();
  expect(profile).not.toHaveBeenCalled();
  locked = false;
  await vi.runAllTimersAsync();
  expect(profile).toHaveBeenCalledExactlyOnceWith('TOKEN_REFRESHED', { user: { id: 'visitor' } });
  subscription.data.subscription.unsubscribe();
});

it('cancels queued notifications when the provider unmounts', async () => {
  vi.useFakeTimers();
  let notify!: (event: any, session: any) => unknown;
  mock.subscribe.mockImplementation(callback => { notify = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; });
  const callback = vi.fn();
  const { data } = authService.onAuthStateChange(callback);
  notify('SIGNED_IN', { user: { id: 'visitor' } });
  data.subscription.unsubscribe();
  await vi.runAllTimersAsync();
  expect(callback).not.toHaveBeenCalled();
  expect(mock.unsubscribe).toHaveBeenCalledOnce();
});

it('does not let another Pro tab replace this identity or sign it out', async () => {
  vi.useFakeTimers();
  let notify!: (event: any, session: any) => unknown;
  mock.subscribe.mockImplementation(callback => { notify = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; });
  const callback = vi.fn();
  const { data } = authService.onAuthStateChange(callback);
  notify('SIGNED_IN', { user: { id: 'another-account' } });
  notify('SIGNED_OUT', null);
  await vi.runAllTimersAsync();
  expect(callback).not.toHaveBeenCalled();
  mock.saved = null;
  notify('SIGNED_OUT', null);
  await vi.runAllTimersAsync();
  expect(callback).toHaveBeenCalledExactlyOnceWith('SIGNED_OUT', null);
  data.subscription.unsubscribe();
});
