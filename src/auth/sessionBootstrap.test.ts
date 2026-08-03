import { describe, expect, it } from 'vitest';
import { canAccessRoute } from './permissions';
import { loadInitialAuthSnapshot, loginAuthState, protectedAuthState, type AuthSnapshot } from './sessionBootstrap';
import type { Profile } from '../shared/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

const session = { access_token: 'token' } as any;
const satProfile = { id: 'sat-profile', company_id: 'company-id', auth_user_id: 'auth-id', first_name: 'SAT', last_name: 'User', email: 'sat@test.local', phone: null, primary_area: null, active: true, roles: ['SAT'] } as any as Profile;

describe('auth session bootstrap', () => {
  it('mantiene /app/partes durante getSession asincrono y permite la ruta al finalizar', async () => {
    const pendingSession = deferred<{ data: { session: any } }>();
    const loading: AuthSnapshot = { initialized: false, session: null, profile: null, profileError: null };
    expect(protectedAuthState(loading)).toBe('loading');

    const snapshotPromise = loadInitialAuthSnapshot(() => pendingSession.promise, async () => satProfile);
    pendingSession.resolve({ data: { session } });
    const snapshot = await snapshotPromise;

    expect(protectedAuthState(snapshot)).toBe('ready');
    expect(canAccessRoute(snapshot.profile, '/app/partes')).toBe(true);
  });

  it('mantiene el detalle /app/partes/:id al recuperar una sesion existente', async () => {
    const snapshot = await loadInitialAuthSnapshot(async () => ({ data: { session } }), async () => satProfile);
    expect(protectedAuthState(snapshot)).toBe('ready');
    expect(canAccessRoute(snapshot.profile, '/app/partes/90ad219b-f5d0-4489-a834-eac040469be6')).toBe(true);
  });

  it('mantiene el detalle /app/checks/:id al recuperar una sesion existente', async () => {
    const snapshot = await loadInitialAuthSnapshot(async () => ({ data: { session } }), async () => satProfile);
    expect(protectedAuthState(snapshot)).toBe('ready');
    expect(canAccessRoute(snapshot.profile, '/app/checks/check-id')).toBe(true);
  });

  it('no decide Navigate a / mientras authLoading esta activo', () => {
    expect(protectedAuthState({ initialized: false, session: null, profile: null, profileError: null })).toBe('loading');
  });

  it('sin sesion redirige a login solo al finalizar la inicializacion', async () => {
    const snapshot = await loadInitialAuthSnapshot(async () => ({ data: { session: null } }), async () => satProfile);
    expect(snapshot.initialized).toBe(true);
    expect(protectedAuthState(snapshot)).toBe('redirect-login');
  });

  it('LoginPage no redirige antes de terminar la inicializacion', () => {
    expect(loginAuthState({ initialized: false, session, profile: satProfile, profileError: null })).toBe('loading');
  });

  it('SAT con primary_area null y roles SAT conserva acceso tras inicializar', async () => {
    const snapshot = await loadInitialAuthSnapshot(async () => ({ data: { session } }), async () => satProfile);
    expect(snapshot.profile?.primary_area).toBeNull();
    expect(canAccessRoute(snapshot.profile, '/app/expedientes')).toBe(true);
  });
});
