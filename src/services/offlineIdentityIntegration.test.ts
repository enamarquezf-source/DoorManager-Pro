import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const remote = vi.hoisted(() => ({ block: vi.fn(), note: vi.fn() }));
vi.mock('./checksService', () => ({ checksService: { syncOfflineBlock: remote.block } }));
vi.mock('./workOrdersService', () => ({ workOrdersService: { syncOfflineNote: remote.note } }));
import { setOfflineIdentity, technicianOfflineService } from './technicianOfflineService';

const alice = { companyId: 'company-a', profileId: 'alice' };
const bob = { companyId: 'company-a', profileId: 'bob' };

beforeEach(async () => {
  vi.stubGlobal('window', new EventTarget());
  remote.block.mockReset(); remote.note.mockReset();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('doormanager-pro-tecnico');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  setOfflineIdentity(alice);
});
afterEach(() => { setOfflineIdentity(null); vi.unstubAllGlobals(); });

describe('offline identity and concurrency with persistent storage', () => {
  it('switching users neither displays, sends, deletes nor blocks another technician\'s changes', async () => {
    const own = await technicianOfflineService.upsert({ type: 'work-note', workOrderId: 'shared-work', payload: { localChangeId: 'alice-note', work: 'Alice work' } });
    expect(own).toMatchObject(alice);
    setOfflineIdentity(bob);
    expect(await technicianOfflineService.pending()).toEqual([]);
    await technicianOfflineService.sync();
    await technicianOfflineService.deleteQueueItems([own.id]);
    await technicianOfflineService.reconcileActiveWork([]);
    expect(remote.note).not.toHaveBeenCalled();
    setOfflineIdentity(alice);
    expect(await technicianOfflineService.pending()).toEqual([own]);
  });

  it('two technicians can capture the same block without replacing each other', async () => {
    const block = { type: 'check-block' as const, checkId: 'check', blockId: 'block', workOrderId: 'part', payload: { status: 'Todo favorable' } };
    const first = await technicianOfflineService.upsert(block);
    setOfflineIdentity(bob);
    const second = await technicianOfflineService.upsert({ ...block, payload: { status: 'No favorable' } });
    expect(second.id).not.toBe(first.id);
    expect(await technicianOfflineService.list()).toEqual([second]);
    setOfflineIdentity(alice);
    expect(await technicianOfflineService.list()).toEqual([first]);
  });

  it('does not lose edits captured while an older block is synchronizing', async () => {
    const first = await technicianOfflineService.upsert({ type: 'check-block', checkId: 'check', blockId: 'block', payload: { status: 'Old' } });
    let finish!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    remote.block.mockImplementationOnce(() => { started(); return new Promise<void>((resolve) => { finish = resolve; }); });
    const sending = technicianOfflineService.sync();
    await began;
    const latest = await technicianOfflineService.upsert({ type: 'check-block', checkId: 'check', blockId: 'block', payload: { status: 'New' } });
    expect(latest.id).toBe(first.id);
    expect(await technicianOfflineService.pendingForCheck('check', [first.revision!])).toEqual([latest]);
    // A second click cannot send the edited revision before the older RPC finishes.
    expect((await technicianOfflineService.sync()).pending).toBe(1);
    expect(remote.block).toHaveBeenCalledOnce();
    finish(); await sending;
    expect(await technicianOfflineService.pending()).toEqual([latest]);
    await technicianOfflineService.sync();
    expect(remote.block).toHaveBeenCalledTimes(2);
    expect(remote.block.mock.calls[1][0].payload.status).toBe('New');
    expect(await technicianOfflineService.pending()).toEqual([]);
  });

  it('claims each queued revision once when synchronization starts concurrently', async () => {
    await technicianOfflineService.upsert({ type: 'work-note', workOrderId: 'part', payload: { localChangeId: 'note', work: 'Text' } });
    let finish!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    remote.note.mockImplementation(() => { started(); return new Promise<void>((resolve) => { finish = resolve; }); });
    const first = technicianOfflineService.sync(); await began;
    await technicianOfflineService.sync();
    expect(remote.note).toHaveBeenCalledOnce();
    finish(); await first;
  });

  it('refuses capture after logout and does not expose stored changes', async () => {
    await technicianOfflineService.upsert({ type: 'work-note', payload: { work: 'Private' } });
    setOfflineIdentity(null);
    expect(await technicianOfflineService.list()).toEqual([]);
    await expect(technicianOfflineService.upsert({ type: 'work-note', payload: {} })).rejects.toThrow('Inicia sesión');
    await expect(technicianOfflineService.sync()).rejects.toThrow('Inicia sesión');
  });
});
