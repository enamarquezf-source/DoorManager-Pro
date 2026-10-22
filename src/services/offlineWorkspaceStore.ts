import { isConnectionFailure } from '../shared/connectionFailure';
export type DeviceIdentity = { companyId: string; profileId: string };
export type DeviceRecord<T = any> = { id: string; scope: string; key: string; savedAt: string; data: T };
let identity: DeviceIdentity | null = null;
export function setWorkspaceIdentity(next: DeviceIdentity | null) { identity = next; }
export function workspaceIdentity() {
  if (!identity) throw new Error('Inicia sesión para abrir el trabajo de este dispositivo.');
  return { ...identity };
}
export function identityScope(value: DeviceIdentity) { return JSON.stringify([value.companyId, value.profileId]); }
export function assertWorkspaceIdentity(value: DeviceIdentity) {
  if (!identity || identityScope(value) !== identityScope(identity)) throw new Error('La sesión ha cambiado. Vuelve a abrir el trabajo.');
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dmp-offline-workspace', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('records', mode);
    const request = action(tx.objectStore('records'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se ha podido guardar en este dispositivo.')); };
  });
}
export const offlineWorkspaceStore = {
  async get<T>(key: string, owner = workspaceIdentity()) {
    assertWorkspaceIdentity(owner);
    const scope = identityScope(owner);
    const row = await transaction('readonly', store => store.get(JSON.stringify([scope, key]))) as DeviceRecord<T> | undefined;
    assertWorkspaceIdentity(owner);
    return row;
  },
  async put<T>(key: string, data: T, owner = workspaceIdentity()) {
    assertWorkspaceIdentity(owner);
    const scope = identityScope(owner);
    const row: DeviceRecord<T> = { id: JSON.stringify([scope, key]), scope, key, savedAt: new Date().toISOString(), data };
    await transaction('readwrite', store => { assertWorkspaceIdentity(owner); return store.put(row); });
    assertWorkspaceIdentity(owner);
    return row;
  },
  async remove(key: string, owner = workspaceIdentity()) {
    await transaction('readwrite', store => { assertWorkspaceIdentity(owner); return store.delete(JSON.stringify([identityScope(owner), key])); });
  },
};

export function connectionAvailable() { return typeof navigator === 'undefined' || navigator.onLine !== false; }

// Reads never wait for the network when a downloaded copy exists. Only the explicit
// download action refreshes a prepared journey. Server denials are never hidden.
export async function readDeviceFirst<T>(key: string, load: () => Promise<T>, refresh = false): Promise<T> {
  const owner = workspaceIdentity();
  const cached = await offlineWorkspaceStore.get<T>(key, owner);
  if (cached && !refresh) return cached.data;
  if (!connectionAvailable()) throw new Error(cached ? 'Conecta para actualizar la jornada. La copia anterior sigue disponible.' : 'Este contenido no está descargado. Conecta y pulsa Preparar jornada.');
  let data: T;
  try { data = await load(); }
  catch (error) {
    if (!isConnectionFailure(error)) await offlineWorkspaceStore.remove(key, owner);
    throw error;
  }
  assertWorkspaceIdentity(owner);
  if (data && typeof data === 'object' && 'company_id' in data && (data as any).company_id && (data as any).company_id !== owner.companyId) throw new Error('El contenido no pertenece a la empresa de esta sesión.');
  await offlineWorkspaceStore.put(key, data, owner);
  return data;
}
