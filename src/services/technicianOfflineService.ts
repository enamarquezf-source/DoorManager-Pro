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
  syncSessionId?: string;
  revision?: string;
};

export type OfflineSyncScope = { workOrderId?: string; checkId?: string; changeId?: string; remoteLocalChangeIds?: string[] };
export type OfflineQueueSummary = ReturnType<typeof summarizeChanges>;

const dbName = 'doormanager-pro-tecnico';
const storeName = 'offline_changes';
const dbVersion = 3;
const currentSyncSessionId = crypto.randomUUID();
type OfflineIdentity = { companyId: string; profileId: string };
let offlineIdentity: OfflineIdentity | null = null;
const inFlightChanges = new Set<string>();

export function setOfflineIdentity(identity: OfflineIdentity | null) {
  const changed = identity?.companyId !== offlineIdentity?.companyId || identity?.profileId !== offlineIdentity?.profileId;
  offlineIdentity = identity;
  if (changed && typeof window !== 'undefined') dispatchQueueChanged();
}

function requireOfflineIdentity() {
  if (!offlineIdentity) throw new Error('Inicia sesión con tu perfil para acceder al trabajo guardado en este dispositivo.');
  return { ...offlineIdentity };
}

function identityIsCurrent(identity: OfflineIdentity) {
  return offlineIdentity?.profileId === identity.profileId && offlineIdentity?.companyId === identity.companyId;
}

function belongsToIdentity(change: OfflineChange, identity: OfflineIdentity) {
  return change.profileId === identity.profileId && (!change.companyId || change.companyId === identity.companyId);
}

const replaceStateTypes = new Set<OfflineChangeType>(['check-block']);

function isReplaceStateType(type: OfflineChangeType) {
  return replaceStateTypes.has(type);
}

function payloadOperationId(change: Pick<OfflineChange, 'payload'>) {
  const value = change.payload?.localChangeId ?? change.payload?.id;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
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
        if (store && oldVersion < 3) migrateStoreToAppendOnlyIds(store);
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
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se ha podido guardar el cambio en el dispositivo.')); };
  });
}

async function updateQueuedRevision(item: OfflineChange, identity: OfflineIdentity, update: (current: OfflineChange) => OfflineChange | 'delete' | null) {
  let updated = false;
  await withStore('readwrite', (store) => {
    const request = store.get(item.id);
    request.onsuccess = () => {
      const current = request.result as OfflineChange | undefined;
      if (!identityIsCurrent(identity) || !current || !belongsToIdentity(current, identity)) return;
      if (current.revision !== item.revision || current.updatedAt !== item.updatedAt) return;
      if (!isQueueOpen(current) && current.status !== 'syncing') return;
      const next = update(current);
      if (!next) return;
      if (next === 'delete') store.delete(item.id); else store.put(next); updated = true;
    };
  });
  return updated;
}

async function allChanges(): Promise<OfflineChange[]> {
  if (!offlineIdentity) return [];
  const identity = requireOfflineIdentity();
  const changes = (await withStore<OfflineChange[]>('readonly', (store) => store.getAll())) ?? [];
  return identityIsCurrent(identity) ? changes.filter((change) => belongsToIdentity(change, identity)) : [];
}

function changeId(type: OfflineChangeType, workOrderId: string | undefined, checkId: string | undefined, blockId?: string) {
  return [type, workOrderId ?? 'sin-parte', checkId ?? 'sin-check', blockId ?? 'general'].join(':');
}

type NewOfflineChange = Omit<OfflineChange, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

function changeKey(change: NewOfflineChange, idFactory: () => string = () => crypto.randomUUID()) {
  if (isReplaceStateType(change.type)) return changeId(change.type, change.workOrderId, change.checkId, change.blockId);
  return payloadOperationId(change) ?? idFactory();
}

export function offlineChangeKeyForTest(change: NewOfflineChange, idFactory = () => 'generated-operation-id') {
  return changeKey(change, idFactory);
}

function migrateLegacyChanges(changes: OfflineChange[], idFactory: () => string = () => crypto.randomUUID()) {
  const usedIds = new Set(changes.map((change) => change.id));
  return changes.map((change) => {
    if (isReplaceStateType(change.type)) return change;

    const legacyId = changeId(change.type, change.workOrderId, change.checkId, change.blockId);
    const payloadId = payloadOperationId(change);
    const targetId = payloadId ?? (change.id === legacyId ? idFactory() : change.id);
    if (targetId === change.id) return change;

    let nextId = targetId;
    while (usedIds.has(nextId) && nextId !== change.id) nextId = idFactory();
    usedIds.add(nextId);
    return { ...change, id: nextId };
  });
}

function migrateStoreToAppendOnlyIds(store: IDBObjectStore) {
  const request = store.getAll();
  request.onsuccess = () => {
    const changes = migrateLegacyChanges(request.result as OfflineChange[]);
    (request.result as OfflineChange[]).forEach((change, index) => {
      const migrated = changes[index];
      if (migrated.id !== change.id) {
        store.put(migrated);
        store.delete(change.id);
      }
    });
  };
}

export function migrateLegacyChangesForTest(changes: OfflineChange[], ids: string[]) {
  let index = 0;
  return migrateLegacyChanges(changes, () => ids[index++] ?? `generated-operation-${index}`);
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

export function recoverInterruptedChangesForTest(changes: OfflineChange[], sessionId: string) {
  return changes.map((item) => item.status === 'syncing' && item.syncSessionId !== sessionId
    ? { ...item, status: 'failed' as const, syncSessionId: undefined, error: 'La sincronización anterior se interrumpió. El cambio está listo para reintentar.' }
    : item);
}

async function recoverInterruptedChanges() {
  if (!offlineIdentity) return [];
  const identity = requireOfflineIdentity();
  const changes = await allChanges();
  const recovered = recoverInterruptedChangesForTest(changes, currentSyncSessionId);
  const changed = recovered.filter((item, index) => item !== changes[index]);
  for (const item of changed) { const original = changes.find(change => change.id === item.id)!; await updateQueuedRevision(original, identity, () => ({ ...item, updatedAt: new Date().toISOString() })); }
  if (changed.length) dispatchQueueChanged();
  return allChanges();
}

export function checkPendingChangesForTest(changes: OfflineChange[], checkId: string, remoteLocalChangeIds: string[] = []) {
  const reconciled = new Set(remoteLocalChangeIds);
  return changes.filter((item) => item.checkId === checkId && isQueueOpen(item) && !reconciled.has(item.type === 'check-block' ? item.revision ?? item.id : item.id));
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

export function queueIdsForTest(changes: OfflineChange[]) {
  return changes.filter(isQueueOpen).map((item) => item.id);
}

export function deleteQueueItemsForTest(changes: OfflineChange[], changeIds: string[]) {
  const ids = new Set(changeIds);
  return changes.filter((item) => !(ids.has(item.id) && isQueueOpen(item)));
}

export function deleteFailedQueueItemsForTest(changes: OfflineChange[]) {
  return changes.filter((item) => item.status !== 'failed');
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

export function syncOfflineChangeForTest(item: OfflineChange) {
  return syncChange(item);
}

export const technicianOfflineService = {
  async upsert(change: NewOfflineChange) {
    const identity = requireOfflineIdentity();
    if ((change.profileId && change.profileId !== identity.profileId) || (change.companyId && change.companyId !== identity.companyId)) throw new Error('Este cambio pertenece a otro perfil o empresa.');
    const baseId = changeKey(change);
    const id = isReplaceStateType(change.type) ? `${identity.profileId}:${baseId}` : baseId;
    const current = (await withStore<OfflineChange | undefined>('readonly', (store) => store.get(id))) as OfflineChange | undefined;
    if (!identityIsCurrent(identity)) throw new Error('La sesión ha cambiado. Vuelve a abrir el parte.');
    if (current && !belongsToIdentity(current, identity)) throw new Error('La identidad del cambio ya pertenece a otro perfil.');
    const now = new Date().toISOString();
    const next: OfflineChange = { ...current, ...change, ...identity, id, revision: crypto.randomUUID(), createdAt: current?.createdAt ?? now, updatedAt: now, status: 'pending', error: undefined };
    await withStore('readwrite', (store) => { store.put(next); });
    dispatchQueueChanged();
    return next;
  },
  list: allChanges,
  async legacyPendingCount() {
    if (!offlineIdentity) return 0;
    const changes = (await withStore<OfflineChange[]>('readonly', (store) => store.getAll())) ?? [];
    return changes.filter((item) => !item.profileId && isQueueOpen(item)).length;
  },
  async pending() {
    return (await recoverInterruptedChanges()).filter(isQueueOpen).sort((a, b) => syncPriority(a) - syncPriority(b));
  },
  async queueItems() {
    return (await recoverInterruptedChanges()).filter(isQueueOpen).sort((a, b) => syncPriority(a) - syncPriority(b) || b.updatedAt.localeCompare(a.updatedAt));
  },
  async history() {
    return allChanges();
  },
  async reconcileActiveWork(activeWorkOrderIds: string[]) {
    const identity = requireOfflineIdentity();
    const active = new Set(activeWorkOrderIds);
    const changes = await allChanges();
    const stale = changes.filter((item) => item.workOrderId && !active.has(item.workOrderId) && isQueueOpen(item));
    for (const item of stale) await updateQueuedRevision(item, identity, current => isQueueOpen(current) ? { ...current, status: 'blocked', error: 'El parte ya no está asignado o activo. No se pierde el cambio; requiere revisión SAT.', updatedAt: new Date().toISOString() } : null);
    if (stale.length) dispatchQueueChanged();
    return { blocked: stale.length, active: active.size };
  },
  async pendingForWorkOrder(workOrderId: string) {
    return (await this.pending()).filter((item) => item.workOrderId === workOrderId);
  },
  async pendingForCheck(checkId: string, remoteLocalChangeIds: string[] = []) {
    return checkPendingChangesForTest(await this.pending(), checkId, remoteLocalChangeIds);
  },
  async sectionState(checkId: string, blockId: string, remoteLocalChangeIds: string[] = []) {
    const pending = await this.pendingForCheck(checkId, remoteLocalChangeIds);
    return pending.find((item) => item.type === 'check-block' && item.blockId === blockId)?.payload;
  },
  summarize(changes: OfflineChange[]) {
    return summarizeChanges(changes);
  },
  safeDetail(value: unknown) {
    return safeOfflineQueueDetailForTest(value);
  },
  async resetForRetry(changeIds: string[]) {
    const identity = requireOfflineIdentity();
    const ids = new Set(changeIds);
    if (!ids.size) return 0;
    const changes = await allChanges();
    const selected = changes.filter((item) => ids.has(item.id) && isQueueOpen(item));
    const now = new Date().toISOString();
    for (const item of selected) await updateQueuedRevision(item, identity, current => isQueueOpen(current) ? { ...current, status: 'pending', error: undefined, updatedAt: now } : null);
    if (selected.length) dispatchQueueChanged();
    return selected.length;
  },
  async deleteQueueItems(changeIds: string[]) {
    const identity = requireOfflineIdentity();
    const ids = new Set(changeIds);
    if (!ids.size) return 0;
    const changes = await allChanges();
    const selected = changes.filter((item) => ids.has(item.id) && isQueueOpen(item));
    for (const item of selected) await updateQueuedRevision(item, identity, current => isQueueOpen(current) ? 'delete' : null);
    if (selected.length) dispatchQueueChanged();
    return selected.length;
  },
  async deleteFailedQueueItems() {
    const identity = requireOfflineIdentity();
    const failed = (await allChanges()).filter((item) => item.status === 'failed');
    for (const item of failed) await updateQueuedRevision(item, identity, current => current.status === 'failed' ? 'delete' : null);
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
    const identity = requireOfflineIdentity();
    const pending = (await this.pending()).filter((item) => changeMatchesScope(item, scope));
    const result = { synced: 0, failed: 0, pending: 0, errors: [] as string[] };
    for (const item of pending) {
      if (!identityIsCurrent(identity)) break;
      if (inFlightChanges.has(item.id)) continue;
      inFlightChanges.add(item.id);
      try {
        onProgress?.(`Sincronizando ${item.type} ${item.blockId ?? item.workOrderId ?? ''}`.trim());
        const claimed = await updateQueuedRevision(item, identity, (current) => current.status === 'syncing' ? null : { ...current, status: 'syncing', syncSessionId: currentSyncSessionId, error: undefined });
        if (!claimed || item.status === 'syncing') continue;
        if (!identityIsCurrent(identity)) throw new Error('La sesión ha cambiado. Reintenta con el perfil que guardó el trabajo.');
        await syncChange(item);
        await updateQueuedRevision(item, identity, (current) => ({ ...current, status: 'synced', syncSessionId: undefined, error: undefined, updatedAt: new Date().toISOString() }));
        result.synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se ha podido sincronizar el cambio.';
        const status = /sincronizar primero|seccion|sección|dependencia/i.test(message) ? 'blocked' : 'failed';
        await updateQueuedRevision(item, identity, (current) => ({ ...current, status, syncSessionId: undefined, error: message, attempts: (current.attempts ?? 0) + 1, updatedAt: new Date().toISOString() }));
        result.failed += 1;
        result.errors.push(message);
      } finally {
        inFlightChanges.delete(item.id);
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
