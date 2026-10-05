import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), profile: vi.fn(), company: vi.fn() }));
vi.mock('./documentsService', () => ({ documentsService: { saveOnce: mocks.save } }));
vi.mock('./query', async original => ({ ...(await original<any>()), currentProfileId: mocks.profile, currentProfileCompanyId: mocks.company }));
import { createDocumentSave, recoverDocumentSave } from './documentSaveOperations';
import { pendingDocumentSave, persistDocumentSave, removeDocumentSave } from './documentSaveAttempts';
import { SupabaseOperationError } from './query';
const base = { profileId: 'alice', companyId: 'company' };
const payload = { title: 'Manual', url: 'https://example.com/manual.pdf' };
beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue('alice'); mocks.company.mockResolvedValue('company'); });
describe('persistent document sends', () => {
  it('recovers a URL-only request after reopening with exact operation and data', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    mocks.save.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce('document');
    await expect(createDocumentSave(scope, payload)).rejects.toThrow();
    vi.resetModules();
    const reopened = await import('./documentSaveOperations');
    expect(await reopened.recoverDocumentSave(scope)).toBe('document');
    expect(mocks.save.mock.calls[0]).toEqual(mocks.save.mock.calls[1]);
    expect(await pendingDocumentSave(scope)).toBeNull();
  });
  it('retains and reconstructs a PDF including its name and content', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    const file = new File(['pdf-content'], 'manual.pdf', { type: 'application/pdf' });
    mocks.save.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce('document');
    await expect(createDocumentSave(scope, { title: 'Manual' }, file)).rejects.toThrow();
    const pending = await pendingDocumentSave(scope);
    expect(await pending?.blob?.text()).toBe('pdf-content');
    expect(pending?.filename).toBe('manual.pdf');
    expect(await recoverDocumentSave(scope)).toBe('document');
    const sent = mocks.save.mock.calls[1];
    expect(sent[2].name).toBe('manual.pdf'); expect(await sent[2].text()).toBe('pdf-content');
    expect(sent[3]).toBe(mocks.save.mock.calls[0][3]);
  });
  it('does not replace pending data or expose it to another actor, company or context', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    mocks.save.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createDocumentSave(scope, payload)).rejects.toThrow();
    await expect(createDocumentSave(scope, { ...payload, title: 'Other' })).rejects.toThrow('Recupera');
    for (const other of [{ ...scope, profileId: 'bob' }, { ...scope, companyId: 'other' }, { ...scope, context: 'other' }]) expect(await pendingDocumentSave(other)).toBeNull();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await removeDocumentSave(scope);
  });
  it('rejects changed sessions and invalid files without sending', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    mocks.company.mockResolvedValueOnce('other');
    await expect(createDocumentSave(scope, payload)).rejects.toThrow('empresa');
    await expect(createDocumentSave(scope, payload, new File([], 'empty.pdf', { type: 'application/pdf' }))).rejects.toThrow('datos');
    expect(mocks.save).not.toHaveBeenCalled(); expect(await pendingDocumentSave(scope)).toBeNull();
  });
  it('never overwrites a pending request in competing storage transactions', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    const first = { operationId: crypto.randomUUID(), payload };
    const results = await Promise.allSettled([persistDocumentSave(scope, first), persistDocumentSave(scope, { operationId: crypto.randomUUID(), payload: { title: 'Other' } })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await pendingDocumentSave(scope)).not.toBeNull();
    await removeDocumentSave(scope);
  });
  it('allows correction after an explicit rolled-back rejection', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    mocks.save.mockRejectedValueOnce(new SupabaseOperationError('Validation', { code: 'P0001' })).mockResolvedValueOnce('document');
    await expect(createDocumentSave(scope, payload)).rejects.toThrow();
    expect(await pendingDocumentSave(scope)).toBeNull();
    expect(await createDocumentSave(scope, { ...payload, title: 'Corrected' })).toBe('document');
    expect(mocks.save.mock.calls[0][0]).not.toBe(mocks.save.mock.calls[1][0]);
  });
  it('does not clear a newer attempt when a stale recovery finishes', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    const newer = { operationId: crypto.randomUUID(), payload };
    await persistDocumentSave(scope, newer);
    await removeDocumentSave(scope, crypto.randomUUID());
    expect((await pendingDocumentSave(scope))?.operationId).toBe(newer.operationId);
    await removeDocumentSave(scope, newer.operationId);
    expect(await pendingDocumentSave(scope)).toBeNull();
  });
  it('does not send when persistent storage cannot be opened', async () => {
    const scope = { ...base, context: crypto.randomUUID() };
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => { throw new Error('Storage unavailable'); });
    try {
      await expect(createDocumentSave(scope, payload)).rejects.toThrow('Storage unavailable');
      expect(mocks.save).not.toHaveBeenCalled();
    } finally { open.mockRestore(); }
  });
});
