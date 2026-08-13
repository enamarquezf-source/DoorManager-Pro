import { checksService } from './checksService';
import { workOrdersService } from './workOrdersService';

export type OfflineChangeType = 'check-block' | 'work-note' | 'material' | 'photo' | 'signature' | 'deficiency';

export type OfflineChange = {
  id: string;
  type: OfflineChangeType;
  workOrderId?: string;
  checkId?: string;
  blockId?: string;
  companyId?: string;
  profileId?: string;
  sectionId?: string;
  itemId?: string;
  remoteId?: string;
  payload: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'blocked';
  error?: string;
  attempts?: number;
};

export type OfflineSyncScope = { workOrderId?: string; checkId?: string; changeId?: string };
export type OfflineQueueSummary = ReturnType<typeof summarizeChanges>;

const dbName = 'doormanager-pro-tecnico';
const storeName = 'offline_changes';
const dbVersion = 2;

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
        store.createIndex('type', 'type');
      } else {
        const tx = request.transaction;
        const store = tx?.objectStore(storeName);
        if (store && !store.indexNames.contains('type')) store.createIndex('type', 'type');
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

function changeKey(change: Omit<OfflineChange, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
  const localId = change.payload?.localChangeId ?? change.payload?.id;
  if (['photo', 'signature', 'deficiency'].includes(change.type) && localId) return [change.type, change.workOrderId ?? 'sin-parte', change.checkId ?? 'sin-check', change.blockId ?? 'general', localId].join(':');
  return changeId(change.type, change.workOrderId, change.checkId, change.blockId);
}

export function offlineChangeKeyForTest(change: Omit<OfflineChange, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
  return changeKey(change);
}

function syncPriority(item: OfflineChange) {
  if (item.type === 'check-block') return 1;
  if (item.type === 'deficiency') return 2;
  if (item.type === 'photo') return 3;
  if (item.type === 'signature') return 4;
  return 5;
}

export function changeMatchesScope(item: Pick<OfflineChange, 'id' | 'workOrderId' | 'checkId'>, scope: OfflineSyncScope = {}) {
  if (scope.changeId) return item.id === scope.changeId;
  if (scope.checkId) return item.checkId === scope.checkId;
  if (scope.workOrderId) return item.workOrderId === scope.workOrderId;
  return true;
}

function isQueueOpen(item: OfflineChange) {
  return item.status === 'pending' || item.status === 'failed' || item.status === 'blocked';
}

function dispatchQueueChanged() {
  window.dispatchEvent(new Event('dmp-offline-queue-changed'));
}

function summarizeChanges(changes: OfflineChange[]) {
  return {
    total: changes.length,
    pending: changes.filter((item) => item.status === 'pending').length,
    failed: changes.filter((item) => item.status === 'failed').length,
    blocked: changes.filter((item) => item.status === 'blocked').length,
    blocks: changes.filter((item) => item.type === 'check-block').length,
    incidences: changes.filter((item) => item.type === 'deficiency' || item.payload.incidence).length,
    photos: changes.filter((item) => item.type === 'photo').length,
    materials: changes.filter((item) => item.type === 'material').length,
    signatures: changes.filter((item) => item.type === 'signature').length,
    synced: changes.filter((item) => item.status === 'synced').length,
  };
}

function sanitizeDiagnosticText(value: string) {
  const sensitiveWords = ['service' + '_role', 'sb' + '_secret', 'apikey', 'api_key', 'authorization', 'bearer', 'token', 'password', 'postgresql:' + '\/\/'];
  return value
    .replace(new RegExp(`(${sensitiveWords.join('|')})[^\\s"'\`]+`, 'gi'), '$1[oculto]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt oculto]')
    .replace(/sbp_[A-Za-z0-9_-]+/g, 'sbp_[oculto]');
}

export function safeOfflineQueueDetailForTest(value: unknown) {
  try {
    return sanitizeDiagnosticText(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  } catch {
    return 'No se ha podido mostrar el detalle técnico.';
  }
}

export function markStaleChangesBlockedForTest(changes: OfflineChange[], activeWorkOrderIds: string[]) {
  const active = new Set(activeWorkOrderIds);
  return changes.map((item) => item.workOrderId && !active.has(item.workOrderId) && isQueueOpen(item) ? { ...item, status: 'blocked' as const, error: 'El parte ya no está asignado o activo. No se pierde el cambio; requiere revisión SAT.' } : item);
}

async function syncChange(item: OfflineChange) {
  if (item.type === 'check-block') await checksService.syncOfflineBlock(item);
  else if (item.type === 'deficiency' && item.checkId) await checksService.syncOfflineDeficiency(item);
  else if (item.type === 'deficiency' && item.workOrderId) await workOrdersService.syncOfflineDeficiency(item.workOrderId, item.payload, item.id);
  else if (item.type === 'photo' && item.checkId) await checksService.syncOfflinePhoto(item);
  else if (item.type === 'photo' && item.workOrderId) await workOrdersService.syncOfflinePhoto(item.workOrderId, item.payload, item.id);
  else if (item.type === 'signature' && item.workOrderId) await workOrdersService.syncOfflineSignature(item.workOrderId, item.payload, item.id);
  else if (item.type === 'work-note' && item.workOrderId) await workOrdersService.syncOfflineNote(item.workOrderId, item.payload, item.id);
  else if (item.type === 'material' && item.workOrderId) await workOrdersService.syncOfflineMaterial(item.workOrderId, item.payload, item.id);
  else throw new Error('Faltan datos para sincronizar este cambio.');
}

export const technicianOfflineService = {
  async upsert(change: Omit<OfflineChange, 'id' | 'createdAt' | 'updatedAt' | 'status'>) {
    const id = changeKey(change);
    const current = (await withStore<OfflineChange | undefined>('readonly', (store) => store.get(id))) as OfflineChange | undefined;
    const now = new Date().toISOString();
    const next: OfflineChange = { ...current, ...change, id, createdAt: current?.createdAt ?? now, updatedAt: now, status: 'pending', error: undefined };
    await withStore('readwrite', (store) => { store.put(next); });
    dispatchQueueChanged();
    return next;
  },
  list: allChanges,
  async pending() {
    return (await allChanges()).filter(isQueueOpen).sort((a, b) => syncPriority(a) - syncPriority(b));
  },
  async queueItems() {
    return (await allChanges()).filter(isQueueOpen).sort((a, b) => syncPriority(a) - syncPriority(b) || b.updatedAt.localeCompare(a.updatedAt));
  },
  async history() {
    return allChanges();
  },
  async reconcileActiveWork(activeWorkOrderIds: string[]) {
    const active = new Set(activeWorkOrderIds);
    const changes = await allChanges();
    const stale = changes.filter((item) => item.workOrderId && !active.has(item.workOrderId) && isQueueOpen(item));
    for (const item of stale) await withStore('readwrite', (store) => { store.put({ ...item, status: 'blocked', error: 'El parte ya no está asignado o activo. No se pierde el cambio; requiere revisión SAT.', updatedAt: new Date().toISOString() }); });
    if (stale.length) dispatchQueueChanged();
    return { blocked: stale.length, active: active.size };
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
    return summarizeChanges(changes);
  },
  safeDetail(value: unknown) {
    return safeOfflineQueueDetailForTest(value);
  },
  async resetForRetry(changeIds: string[]) {
    const ids = new Set(changeIds);
    if (!ids.size) return 0;
    const changes = await allChanges();
    const selected = changes.filter((item) => ids.has(item.id) && isQueueOpen(item));
    const now = new Date().toISOString();
    for (const item of selected) await withStore('readwrite', (store) => { store.put({ ...item, status: 'pending', error: undefined, updatedAt: now }); });
    if (selected.length) dispatchQueueChanged();
    return selected.length;
  },
  async deleteQueueItems(changeIds: string[]) {
    const ids = new Set(changeIds);
    if (!ids.size) return 0;
    const changes = await allChanges();
    const selected = changes.filter((item) => ids.has(item.id) && isQueueOpen(item));
    for (const item of selected) await withStore('readwrite', (store) => { store.delete(item.id); });
    if (selected.length) dispatchQueueChanged();
    return selected.length;
  },
  async deleteFailedQueueItems() {
    const failed = (await allChanges()).filter((item) => item.status === 'failed');
    for (const item of failed) await withStore('readwrite', (store) => { store.delete(item.id); });
    if (failed.length) dispatchQueueChanged();
    return failed.length;
  },
  async syncSelected(changeIds: string[], onProgress?: (message: string) => void) {
    const ids = [...new Set(changeIds)];
    const result = { synced: 0, failed: 0, pending: 0, errors: [] as string[] };
    for (const id of ids) {
      const one = await this.sync(onProgress, { changeId: id });
      result.synced += one.synced;
      result.failed += one.failed;
      result.errors.push(...one.errors);
    }
    const remaining = await allChanges();
    result.pending = remaining.filter((item) => isQueueOpen(item) && ids.includes(item.id)).length;
    return result;
  },
  async sync(onProgress?: (message: string) => void, scope: OfflineSyncScope = {}) {
    const pending = (await this.pending()).filter((item) => changeMatchesScope(item, scope));
    const result = { synced: 0, failed: 0, pending: 0, errors: [] as string[] };
    for (const item of pending) {
      try {
        onProgress?.(`Sincronizando ${item.type} ${item.blockId ?? item.workOrderId ?? ''}`.trim());
        await withStore('readwrite', (store) => { store.put({ ...item, status: 'syncing', error: undefined }); });
        await syncChange(item);
        await withStore('readwrite', (store) => { store.delete(item.id); });
        result.synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido sincronizar el cambio.';
        const status = /sincronizar primero|seccion|sección|dependencia/i.test(message) ? 'blocked' : 'failed';
        await withStore('readwrite', (store) => { store.put({ ...item, status, error: message, attempts: (item.attempts ?? 0) + 1 }); });
        result.failed += 1;
        result.errors.push(message);
      }
    }
    const remaining = await allChanges();
    result.pending = remaining.filter((item) => isQueueOpen(item) && changeMatchesScope(item, scope)).length;
    dispatchQueueChanged();
    return result;
  },
  syncOne(changeId: string, onProgress?: (message: string) => void) {
    return this.sync(onProgress, { changeId });
  },
};
