import { checksService } from './checksService';

export type OfflineChangeType = 'check-block' | 'work-note' | 'material' | 'photo' | 'signature';

export type OfflineChange = {
  id: string;
  type: OfflineChangeType;
  workOrderId?: string;
  checkId?: string;
  blockId?: string;
  payload: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
};

const dbName = 'doormanager-pro-tecnico';
const storeName = 'offline_changes';
const dbVersion = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('checkId', 'checkId');
        store.createIndex('workOrderId', 'workOrderId');
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = action(store);
    tx.oncomplete = () => { db.close(); resolve(request ? request.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function allChanges(): Promise<OfflineChange[]> {
  return (await withStore<OfflineChange[]>('readonly', (store) => store.getAll())) ?? [];
}

function changeId(type: OfflineChangeType, workOrderId: string | undefined, checkId: string | undefined, blockId?: string) {
  return [type, workOrderId ?? 'sin-parte', checkId ?? 'sin-check', blockId ?? 'general'].join(':');
}

export const technicianOfflineService = {
  async upsert(change: Omit<OfflineChange, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
    const id = changeId(change.type, change.workOrderId, change.checkId, change.blockId);
    const current = (await withStore<OfflineChange | undefined>('readonly', (store) => store.get(id))) as OfflineChange | undefined;
    const now = new Date().toISOString();
    const next: OfflineChange = { ...current, ...change, id, createdAt: current?.createdAt ?? now, updatedAt: now, status: 'pending', error: undefined };
    await withStore('readwrite', (store) => { store.put(next); });
    window.dispatchEvent(new Event('dmp-offline-queue-changed'));
    return next;
  },
  list: allChanges,
  async pending() {
    return (await allChanges()).filter((item) => item.status === 'pending' || item.status === 'failed');
  },
  async pendingForWorkOrder(workOrderId: string) {
    return (await this.pending()).filter((item) => item.workOrderId === workOrderId);
  },
  async pendingForCheck(checkId: string) {
    return (await this.pending()).filter((item) => item.checkId === checkId);
  },
  async sectionState(checkId: string, blockId: string) {
    const pending = await this.pendingForCheck(checkId);
    return pending.find((item) => item.type === 'check-block' && item.blockId === blockId)?.payload;
  },
  summarize(changes: OfflineChange[]) {
    return {
      total: changes.length,
      blocks: changes.filter((item) => item.type === 'check-block').length,
      incidences: changes.filter((item) => item.payload.incidence).length,
      photos: changes.filter((item) => item.type === 'photo' || item.payload.photos?.length).length,
      materials: changes.filter((item) => item.type === 'material').length,
      signatures: changes.filter((item) => item.type === 'signature').length,
    };
  },
  async sync(onProgress?: (message: string) => void) {
    const pending = await this.pending();
    const result = { synced: 0, failed: 0, pending: 0, errors: [] as string[] };
    for (const item of pending) {
      try {
        onProgress?.(`Sincronizando ${item.type} ${item.blockId ?? item.workOrderId ?? ''}`.trim());
        await withStore('readwrite', (store) => { store.put({ ...item, status: 'syncing', error: undefined }); });
        if (item.type === 'check-block') await checksService.syncOfflineBlock(item);
        else throw new Error('Este cambio queda preparado para sincronización cuando el almacenamiento remoto esté disponible.');
        await withStore('readwrite', (store) => { store.delete(item.id); });
        result.synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido sincronizar el cambio.';
        await withStore('readwrite', (store) => { store.put({ ...item, status: 'failed', error: message }); });
        result.failed += 1;
        result.errors.push(message);
      }
    }
    result.pending = (await this.pending()).length;
    window.dispatchEvent(new Event('dmp-offline-queue-changed'));
    return result;
  },
};
