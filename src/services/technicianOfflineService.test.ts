import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./checksService', () => ({ checksService: {} }));
const syncMocks = vi.hoisted(() => ({ syncOfflineNote: vi.fn(), syncOfflineMaterial: vi.fn(), syncOfflineSignature: vi.fn() }));
vi.mock('./workOrdersService', () => ({ workOrdersService: syncMocks }));

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

  it('mantiene dos notas append-only del mismo parte como operaciones distintas', async () => {
    const { offlineChangeKeyForTest } = await import('./technicianOfflineService');
    const first = offlineChangeKeyForTest({ type: 'work-note', workOrderId: 'wo', payload: { localChangeId: 'note-1' } });
    const second = offlineChangeKeyForTest({ type: 'work-note', workOrderId: 'wo', payload: { localChangeId: 'note-2' } });
    expect(new Set([first, second]).size).toBe(2);
  });

  it('mantiene dos materiales y material + nota del mismo parte', async () => {
    const { offlineChangeKeyForTest } = await import('./technicianOfflineService');
    const materialA = offlineChangeKeyForTest({ type: 'material', workOrderId: 'wo', payload: { localChangeId: 'material-1' } });
    const materialB = offlineChangeKeyForTest({ type: 'material', workOrderId: 'wo', payload: { localChangeId: 'material-2' } });
    const note = offlineChangeKeyForTest({ type: 'work-note', workOrderId: 'wo', payload: { localChangeId: 'note-1' } });
    expect(new Set([materialA, materialB, note]).size).toBe(3);
  });

  it('mantiene dos firmas append-only del mismo parte', async () => {
    const { offlineChangeKeyForTest } = await import('./technicianOfflineService');
    const first = offlineChangeKeyForTest({ type: 'signature', workOrderId: 'wo', payload: { localChangeId: 'signature-1' } });
    const second = offlineChangeKeyForTest({ type: 'signature', workOrderId: 'wo', payload: { localChangeId: 'signature-2' } });
    expect(new Set([first, second]).size).toBe(2);
  });

  it('genera una identidad una sola vez cuando el append-only no trae ID', async () => {
    const { offlineChangeKeyForTest } = await import('./technicianOfflineService');
    const id = offlineChangeKeyForTest({ type: 'material', workOrderId: 'wo', payload: {} }, () => 'generated-1');
    expect(id).toBe('generated-1');
  });

  it('preserva la identidad durante retry y reload conceptual', async () => {
    const { migrateLegacyChangesForTest } = await import('./technicianOfflineService');
    const original = { id: 'note-1', type: 'work-note' as const, workOrderId: 'wo', payload: { localChangeId: 'note-1', work: 'Ajuste' }, status: 'failed' as const, attempts: 1, createdAt: 'created', updatedAt: 'updated' };
    const migrated = migrateLegacyChangesForTest([original], ['generated-id']);
    expect(migrated[0].id).toBe('note-1');
    expect({ ...migrated[0], status: 'pending' }).toMatchObject({ id: 'note-1', payload: original.payload });
  });

  it('migra v2 append-only sin duplicar y conserva replace-state', async () => {
    const { migrateLegacyChangesForTest, offlineChangeKeyForTest } = await import('./technicianOfflineService');
    const legacyNote = { id: 'work-note:wo:sin-check:general', type: 'work-note' as const, workOrderId: 'wo', payload: { work: 'Ajuste' }, status: 'pending' as const, createdAt: 'created', updatedAt: 'updated' };
    const legacyBlock = { id: offlineChangeKeyForTest({ type: 'check-block', workOrderId: 'wo', checkId: 'check', blockId: 'block', payload: {} }), type: 'check-block' as const, workOrderId: 'wo', checkId: 'check', blockId: 'block', payload: { status: 'Todo favorable' }, status: 'pending' as const, createdAt: 'created', updatedAt: 'updated' };
    const migrated = migrateLegacyChangesForTest([legacyNote, legacyBlock], ['note-v3']);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].id).toBe('note-v3');
    expect(migrated[1].id).toBe(legacyBlock.id);
    expect(migrateLegacyChangesForTest(migrated, ['second-pass-id'])).toEqual(migrated);
  });

  it('procesa dos notas con sus IDs independientes durante sync', async () => {
    const { syncOfflineChangeForTest } = await import('./technicianOfflineService');
    await syncOfflineChangeForTest({ id: 'note-1', type: 'work-note', workOrderId: 'wo', payload: { work: 'Uno' }, status: 'pending', createdAt: '', updatedAt: '' });
    await syncOfflineChangeForTest({ id: 'note-2', type: 'work-note', workOrderId: 'wo', payload: { work: 'Dos' }, status: 'pending', createdAt: '', updatedAt: '' });
    expect(syncMocks.syncOfflineNote).toHaveBeenNthCalledWith(1, 'wo', { work: 'Uno' }, 'note-1');
    expect(syncMocks.syncOfflineNote).toHaveBeenNthCalledWith(2, 'wo', { work: 'Dos' }, 'note-2');
  });

  it('conserva el contrato de IDs para fotos e incidencias', async () => {
    const { offlineChangeKeyForTest } = await import('./technicianOfflineService');
    expect(offlineChangeKeyForTest({ type: 'photo', workOrderId: 'wo', payload: { id: 'photo-1' } })).toBe('photo-1');
    expect(offlineChangeKeyForTest({ type: 'deficiency', workOrderId: 'wo', payload: { id: 'incident-1' } })).toBe('incident-1');
  });

  it('migra una IndexedDB v2 real a v3 y no remigra al reabrir', async () => {
    const dbName = 'doormanager-pro-tecnico';
    const storeName = 'offline_changes';
    const blockId = 'check-block:wo-1:check-1:block-1';
    const records = [
      { id: 'work-note:wo-1:sin-check:general', type: 'work-note', workOrderId: 'wo-1', payload: { work: 'Nota legacy' }, status: 'failed', attempts: 2, createdAt: 'created-note', updatedAt: 'updated-note' },
      { id: 'signature:wo-1:sin-check:general', type: 'signature', workOrderId: 'wo-1', payload: { signerName: 'Cliente' }, status: 'pending', attempts: 1, createdAt: 'created-signature', updatedAt: 'updated-signature' },
      { id: 'material:wo-1:sin-check:general', type: 'material', workOrderId: 'wo-1', payload: { material: 'Tornillo', quantity: 2 }, status: 'blocked', attempts: 3, createdAt: 'created-material', updatedAt: 'updated-material' },
      { id: blockId, type: 'check-block', workOrderId: 'wo-1', checkId: 'check-1', blockId: 'block-1', payload: { status: 'Todo favorable' }, status: 'pending', attempts: 0, createdAt: 'created-block', updatedAt: 'updated-block' },
      { id: 'photo-existing', type: 'photo', workOrderId: 'wo-1', payload: { id: 'photo-existing', name: 'existing.jpg' }, status: 'synced', attempts: 1, createdAt: 'created-photo', updatedAt: 'updated-photo' },
    ];

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 2);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(storeName, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('checkId', 'checkId');
        store.createIndex('workOrderId', 'workOrderId');
        store.createIndex('type', 'type');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(records[0]);
        records.slice(1).forEach((record) => transaction.objectStore(storeName).put(record));
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });

    const upgradeVersions: number[] = [];
    const originalOpen = indexedDB.open.bind(indexedDB);
    const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(((name: string, version?: number) => {
      const request = originalOpen(name, version);
      request.addEventListener('upgradeneeded', (event) => {
        upgradeVersions.push((event as IDBVersionChangeEvent).oldVersion);
      });
      return request;
    }) as typeof indexedDB.open);

    const { technicianOfflineService } = await import('./technicianOfflineService');
    const migrated = await technicianOfflineService.list();
    expect(upgradeVersions).toEqual([2]);
    expect(migrated).toHaveLength(records.length);

    for (const type of ['work-note', 'material', 'signature']) {
      const old = records.find((record) => record.type === type)!;
      const next = migrated.find((record) => record.type === type)!;
      expect(next.id).not.toBe(old.id);
      expect(next).toMatchObject({ type: old.type, workOrderId: old.workOrderId, payload: old.payload, status: old.status, attempts: old.attempts, createdAt: old.createdAt, updatedAt: old.updatedAt });
    }

    expect(migrated.find((record) => record.type === 'check-block')).toEqual(records[3]);
    expect(migrated.find((record) => record.id === 'photo-existing')).toEqual(records[4]);
    expect(new Set(migrated.map((record) => record.id)).size).toBe(records.length);
    expect(migrated.some((record) => records.slice(0, 3).some((old) => old.id === record.id))).toBe(false);

    const firstIds = migrated.map((record) => record.id).sort();
    const reopened = await technicianOfflineService.list();
    expect(upgradeVersions).toEqual([2]);
    expect(reopened).toHaveLength(records.length);
    expect(reopened.map((record) => record.id).sort()).toEqual(firstIds);
    expect(new Set(reopened.map((record) => record.id)).size).toBe(records.length);
    openSpy.mockRestore();
  });

  it('evita colisionar durante migracion cuando el payload ID ya existe', async () => {
    const { migrateLegacyChangesForTest } = await import('./technicianOfflineService');
    const legacySignature = { id: 'signature:wo:sin-check:general', type: 'signature' as const, workOrderId: 'wo', payload: { localChangeId: 'existing-id' }, status: 'pending' as const, createdAt: '', updatedAt: '' };
    const existing = { id: 'existing-id', type: 'photo' as const, workOrderId: 'wo', payload: { id: 'existing-id' }, status: 'synced' as const, createdAt: '', updatedAt: '' };
    const migrated = migrateLegacyChangesForTest([legacySignature, existing], ['safe-id']);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].id).toBe('safe-id');
    expect(migrated[1]).toEqual(existing);
    expect(new Set(migrated.map((record) => record.id)).size).toBe(2);
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
