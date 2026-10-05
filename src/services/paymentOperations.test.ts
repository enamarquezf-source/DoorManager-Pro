import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), profile: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./query', async original => ({ ...(await original<any>()), currentProfileId: mocks.profile }));
import { pendingPaymentAttempt, recordPaymentOperation, type PaymentPayload } from './paymentOperations';
const scope = { profileId: 'alice', companyId: 'company' };
const payload: PaymentPayload = { invoice_id: 'invoice', amount: 25, date: '2026-10-05', method: 'transferencia', reference: null, notes: null, treasury_account_id: 'account' };
let stored: Map<string, string>;

beforeEach(() => {
  vi.clearAllMocks(); mocks.profile.mockResolvedValue('alice');
  stored = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

describe('persistent payment operation recovery', () => {
  it('recovers the exact operation after a lost response and a fresh service instance', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } }).mockResolvedValueOnce({ data: 'payment', error: null });
    await expect(recordPaymentOperation(scope, 'supplier', payload)).rejects.toThrow('No hay conexión');
    const pending = pendingPaymentAttempt(scope, 'supplier', 'invoice');
    expect(pending?.payload).toEqual(payload);
    vi.resetModules();
    const reopened = await import('./paymentOperations');
    expect(await reopened.recordPaymentOperation(scope, 'supplier', payload)).toBe('payment');
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(stored.size).toBe(0);
  });
  it('does not replace an uncertain request with edited payment data', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(recordPaymentOperation(scope, 'customer', payload)).rejects.toThrow();
    await expect(recordPaymentOperation(scope, 'customer', { ...payload, amount: 30 })).rejects.toThrow('Recupera');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(pendingPaymentAttempt(scope, 'customer', 'invoice')?.payload.amount).toBe(25);
  });
  it('separates pending requests by actor, company, invoice and payment kind', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(recordPaymentOperation(scope, 'supplier', payload)).rejects.toThrow();
    expect(pendingPaymentAttempt({ ...scope, profileId: 'bob' }, 'supplier', 'invoice')).toBeNull();
    expect(pendingPaymentAttempt({ ...scope, companyId: 'other' }, 'supplier', 'invoice')).toBeNull();
    expect(pendingPaymentAttempt(scope, 'customer', 'invoice')).toBeNull();
    expect(pendingPaymentAttempt(scope, 'supplier', 'other-invoice')).toBeNull();
  });
  it('does not send if the session changed or the identifier cannot be persisted', async () => {
    mocks.profile.mockResolvedValueOnce('bob');
    await expect(recordPaymentOperation(scope, 'supplier', payload)).rejects.toThrow('sesión');
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw Error('Storage unavailable'); } });
    await expect(recordPaymentOperation(scope, 'supplier', payload)).rejects.toThrow('Storage unavailable');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('clears a transactionally rejected attempt so corrected data can be sent', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'permiso: prueba rechazada' } }).mockResolvedValueOnce({ data: 'payment', error: null });
    await expect(recordPaymentOperation(scope, 'supplier', payload)).rejects.toThrow('permiso');
    expect(stored.size).toBe(0);
    await recordPaymentOperation(scope, 'supplier', { ...payload, amount: 30 });
    expect(mocks.rpc.mock.calls[0][1].p_operation_id).not.toBe(mocks.rpc.mock.calls[1][1].p_operation_id);
  });
  it('does not merge separate successfully confirmed payments with identical amounts', async () => {
    mocks.rpc.mockResolvedValue({ data: 'payment', error: null });
    await recordPaymentOperation(scope, 'supplier', payload);
    await recordPaymentOperation(scope, 'supplier', payload);
    expect(mocks.rpc.mock.calls[0][1].p_operation_id).not.toBe(mocks.rpc.mock.calls[1][1].p_operation_id);
  });
});
