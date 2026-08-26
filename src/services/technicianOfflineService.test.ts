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

  it('resume pendientes, fallidos, bloqueados y tipos de cambio de la cola', async () => {
    const { technicianOfflineService } = await import('./technicianOfflineService');
    const changes: any[] = [
      { id: 'block', type: 'check-block', payload: {}, status: 'pending', createdAt: '', updatedAt: '' },
      { id: 'deficiency', type: 'deficiency', payload: {}, status: 'failed', createdAt: '', updatedAt: '' },
      { id: 'photo', type: 'photo', payload: {}, status: 'blocked', createdAt: '', updatedAt: '' },
      { id: 'material', type: 'material', payload: {}, status: 'synced', createdAt: '', updatedAt: '' },
      { id: 'signature', type: 'signature', payload: {}, status: 'pending', createdAt: '', updatedAt: '' },
    ];
    expect(technicianOfflineService.summarize(changes)).toMatchObject({ total: 5, pending: 2, failed: 1, blocked: 1, synced: 1, blocks: 1, incidences: 1, photos: 1, materials: 1, signatures: 1 });
  });

  it('oculta secretos en detalles tecnicos de errores y payloads locales', async () => {
    const { safeOfflineQueueDetailForTest } = await import('./technicianOfflineService');
    const pgUrl = 'postgresql:' + '//user:pass@host';
    const roleKey = 'service' + '_role';
    const detail = safeOfflineQueueDetailForTest({ error: `authorization Bearer eyJabc.def.ghi token sbp_supersecret ${pgUrl} ${roleKey} secret` });
    expect(detail).toContain('[jwt oculto]');
    expect(detail).toContain('sbp_[oculto]');
    expect(detail).not.toContain('eyJabc.def.ghi');
    expect(detail).not.toContain('sbp_supersecret');
    expect(detail).not.toContain('user:pass@host');
  });

  it('usa el mismo id de cola para listar y borrar seleccionados', async () => {
    const { queueIdsForTest, deleteQueueItemsForTest } = await import('./technicianOfflineService');
    const changes: any[] = [
      { id: 'change-a', type: 'material', payload: {}, status: 'pending', createdAt: '', updatedAt: '' },
      { id: 'change-b', type: 'work-note', payload: {}, status: 'failed', createdAt: '', updatedAt: '' },
      { id: 'synced', type: 'photo', payload: {}, status: 'synced', createdAt: '', updatedAt: '' },
    ];
    const listedIds = queueIdsForTest(changes);
    expect(listedIds).toEqual(['change-a', 'change-b']);
    expect(deleteQueueItemsForTest(changes, ['change-a']).map((item) => item.id)).toEqual(['change-b', 'synced']);
  });

  it('borra fallidos sin tocar pendientes ni sincronizados', async () => {
    const { deleteFailedQueueItemsForTest } = await import('./technicianOfflineService');
    const changes: any[] = [
      { id: 'pending', type: 'material', payload: {}, status: 'pending', createdAt: '', updatedAt: '' },
      { id: 'failed', type: 'work-note', payload: {}, status: 'failed', createdAt: '', updatedAt: '' },
      { id: 'blocked', type: 'photo', payload: {}, status: 'blocked', createdAt: '', updatedAt: '' },
      { id: 'synced', type: 'signature', payload: {}, status: 'synced', createdAt: '', updatedAt: '' },
    ];
    expect(deleteFailedQueueItemsForTest(changes).map((item) => item.id)).toEqual(['pending', 'blocked', 'synced']);
  });

  it('recupera una sincronizacion interrumpida por un reinicio de la app', async () => {
    const { recoverInterruptedChangesForTest } = await import('./technicianOfflineService');
    const changes: any[] = [
      { id: 'orphan', type: 'material', payload: {}, status: 'syncing', syncSessionId: 'old-session', createdAt: '', updatedAt: '' },
      { id: 'active', type: 'photo', payload: {}, status: 'syncing', syncSessionId: 'current-session', createdAt: '', updatedAt: '' },
    ];
    const recovered = recoverInterruptedChangesForTest(changes, 'current-session');
    expect(recovered[0].status).toBe('failed');
    expect(recovered[0].error).toContain('listo para reintentar');
    expect(recovered[1].status).toBe('syncing');
  });
});
