import { describe, expect, it, vi } from 'vitest';

vi.mock('./checksService', () => ({ checksService: {} }));
vi.mock('./workOrdersService', () => ({ workOrdersService: {} }));

describe('technicianOfflineService scope helpers', () => {
  it('filtra sincronizacion por check', async () => {
    const { changeMatchesScope } = await import('./technicianOfflineService');
    expect(changeMatchesScope({ id: '1', checkId: 'check-a', workOrderId: 'wo-a' }, { checkId: 'check-a' })).toBe(true);
    expect(changeMatchesScope({ id: '2', checkId: 'check-b', workOrderId: 'wo-a' }, { checkId: 'check-a' })).toBe(false);
  });

  it('filtra sincronizacion por parte', async () => {
    const { changeMatchesScope } = await import('./technicianOfflineService');
    expect(changeMatchesScope({ id: '1', checkId: 'check-a', workOrderId: 'wo-a' }, { workOrderId: 'wo-a' })).toBe(true);
    expect(changeMatchesScope({ id: '2', checkId: 'check-b', workOrderId: 'wo-b' }, { workOrderId: 'wo-a' })).toBe(false);
  });

  it('filtra reintento individual por changeId', async () => {
    const { changeMatchesScope } = await import('./technicianOfflineService');
    expect(changeMatchesScope({ id: 'change-a', checkId: 'check-a', workOrderId: 'wo-a' }, { changeId: 'change-a' })).toBe(true);
    expect(changeMatchesScope({ id: 'change-b', checkId: 'check-a', workOrderId: 'wo-a' }, { changeId: 'change-a' })).toBe(false);
  });

  it('mantiene bloque y foto como claves independientes e idempotentes por archivo', async () => {
    const { offlineChangeKeyForTest } = await import('./technicianOfflineService');
    const blockKey = offlineChangeKeyForTest({ type: 'check-block', workOrderId: 'wo', checkId: 'check', blockId: 'hoja', payload: { status: 'No favorable' } });
    const photoKey = offlineChangeKeyForTest({ type: 'photo', workOrderId: 'wo', checkId: 'check', blockId: 'hoja', payload: { id: 'photo-1' } });
    const samePhotoKey = offlineChangeKeyForTest({ type: 'photo', workOrderId: 'wo', checkId: 'check', blockId: 'hoja', payload: { id: 'photo-1' } });
    expect(blockKey).not.toBe(photoKey);
    expect(photoKey).toBe(samePhotoKey);
  });
});
