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

  it('bloquea cambios locales de partes obsoletos sin perderlos', async () => {
    const { markStaleChangesBlockedForTest } = await import('./technicianOfflineService');
    const changes: any[] = [
      { id: '1', type: 'material', workOrderId: 'active', payload: {}, status: 'pending', createdAt: '', updatedAt: '' },
      { id: '2', type: 'photo', workOrderId: 'stale', payload: {}, status: 'pending', createdAt: '', updatedAt: '' },
      { id: '3', type: 'signature', workOrderId: 'stale-synced', payload: {}, status: 'synced', createdAt: '', updatedAt: '' },
    ];
    const result = markStaleChangesBlockedForTest(changes, ['active']);
    expect(result[0].status).toBe('pending');
    expect(result[1].status).toBe('blocked');
    expect(result[1].error).toContain('No se pierde el cambio');
    expect(result[2].status).toBe('synced');
  });

  it('usa la lista fresca del servidor para bloquear partes que desaparecen de la jornada', async () => {
    const { markStaleChangesBlockedForTest } = await import('./technicianOfflineService');
    const before: any[] = [
      { id: 'old-material', type: 'material', workOrderId: 'wo-old', payload: { material: 'Bisagra' }, status: 'pending', createdAt: '', updatedAt: '' },
      { id: 'new-note', type: 'work-note', workOrderId: 'wo-new', payload: { work: 'Ajuste' }, status: 'failed', createdAt: '', updatedAt: '' },
    ];
    const freshServerWork = ['wo-new'];
    const result = markStaleChangesBlockedForTest(before, freshServerWork);
    expect(result.find((item) => item.id === 'old-material')?.status).toBe('blocked');
    expect(result.find((item) => item.id === 'old-material')?.payload.material).toBe('Bisagra');
    expect(result.find((item) => item.id === 'new-note')?.status).toBe('failed');
  });
});
