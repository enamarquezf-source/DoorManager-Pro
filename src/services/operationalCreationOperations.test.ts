import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), profile: vi.fn(), company: vi.fn() }));
vi.mock('./operationalRegistersService', () => ({ operationalRegistersService: { createOnce: mocks.create } }));
vi.mock('./query', async original => ({ ...(await original<any>()), currentProfileId: mocks.profile, currentProfileCompanyId: mocks.company }));
import { SupabaseOperationError } from './query';
import { createRegisterOperation, recoverRegisterCreation, pendingRegisterCreation } from './operationalCreationOperations';
const scope = { profileId: 'alice', companyId: 'company' };
const payload = { title: 'Certificado', profile_id: 'worker' };
let stored: Map<string, string>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.profile.mockResolvedValue('alice'); mocks.company.mockResolvedValue('company');
  stored = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());
describe('persistent operational creation recovery', () => {
  it('recovers the same request after lost response and a fresh module instance', async () => {
    mocks.create.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce('record');
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow();
    vi.resetModules();
    const reopened = await import('./operationalCreationOperations');
    expect(await reopened.recoverRegisterCreation(scope, 'prl')).toBe('record');
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect(stored.size).toBe(0);
  });
  it('blocks another creation while uncertain, including identical edited form data', async () => {
    mocks.create.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow();
    await expect(createRegisterOperation(scope, 'prl', { ...payload, title: 'Other' })).rejects.toThrow('Recupera');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(pendingRegisterCreation(scope, 'prl')?.payload).toEqual(payload);
  });
  it('isolates stored requests by company, actor and kind', async () => {
    mocks.create.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow();
    expect(pendingRegisterCreation({ ...scope, profileId: 'bob' }, 'prl')).toBeNull();
    expect(pendingRegisterCreation({ ...scope, companyId: 'other' }, 'prl')).toBeNull();
    expect(pendingRegisterCreation(scope, 'vehicle')).toBeNull();
  });
  it('does not send with changed company or unavailable persistent storage', async () => {
    mocks.company.mockResolvedValueOnce('other');
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow('empresa');
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw Error('Storage unavailable'); } });
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow('Storage unavailable');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('allows corrected data after a confirmed transaction rejection', async () => {
    mocks.create.mockRejectedValueOnce(new SupabaseOperationError('Validation', { code: 'P0001' })).mockResolvedValueOnce('record');
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow();
    expect(stored.size).toBe(0);
    await createRegisterOperation(scope, 'prl', { ...payload, title: 'Corrected' });
    expect(mocks.create.mock.calls[0][1]).not.toBe(mocks.create.mock.calls[1][1]);
  });
  it('does not fabricate a recovery request when none is stored', async () => {
    await expect(recoverRegisterCreation(scope, 'vehicle')).rejects.toThrow('No hay');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('blocks an overlapping creation while its first request is still running', async () => {
    let release!: (id: string) => void;
    mocks.create.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
    const first = createRegisterOperation(scope, 'vehicle', { name: 'Test', registration: 'TEST' });
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await expect(createRegisterOperation(scope, 'vehicle', { name: 'Other' })).rejects.toThrow('enviando');
    release('record');
    expect(await first).toBe('record');
    expect(stored.size).toBe(0);
  });
  it('preserves a malformed stored attempt instead of overwriting it with another creation', async () => {
    stored.set('dmp-register-creation-v1:company:alice:prl', JSON.stringify({ operationId: 'invalid', payload }));
    await expect(createRegisterOperation(scope, 'prl', payload)).rejects.toThrow('revisión');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(stored.size).toBe(1);
  });
});
