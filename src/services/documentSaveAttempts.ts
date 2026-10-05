export type DocumentSaveScope = { profileId: string; companyId: string; context: string };
export type DocumentSaveAttempt = {
  operationId: string;
  payload: Record<string, unknown>;
  uploadPath?: string;
  blob?: Blob;
  filename?: string;
};
function key(scope: DocumentSaveScope) {
  if (!scope.profileId || !scope.companyId || !scope.context) throw new Error('No se puede identificar el propietario del envío documental.');
  return JSON.stringify([scope.companyId, scope.profileId, scope.context]);
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open('dmp-document-save-attempts', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('attempts'); };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { settled = true; reject(request.error ?? new Error('No se puede guardar el envío pendiente.')); };
    request.onblocked = () => { settled = true; reject(new Error('Cierra otras pestañas para preparar el almacenamiento documental.')); };
  });
}
async function transact<T>(mode: IDBTransactionMode, scope: DocumentSaveScope, operation: (store: IDBObjectStore, storageKey: string) => IDBRequest<T>): Promise<T> {
  const storageKey = key(scope);
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('attempts', mode);
      let result: T;
      const request = operation(transaction.objectStore('attempts'), storageKey);
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error('No se ha podido conservar el envío documental.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Error de almacenamiento documental.'));
    });
  } finally { db.close(); }
}
export async function pendingDocumentSave(scope: DocumentSaveScope): Promise<DocumentSaveAttempt | null> {
  const attempt = await transact<DocumentSaveAttempt | undefined>('readonly', scope, (store, storageKey) => store.get(storageKey));
  if (!attempt) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt.operationId ?? '')
    || !attempt.payload || typeof attempt.payload !== 'object' || Array.isArray(attempt.payload)
    || (attempt.blob && (!(attempt.blob instanceof Blob) || !attempt.filename || !attempt.uploadPath))) {
    throw new Error('El envío documental pendiente necesita revisión antes de continuar.');
  }
  return attempt;
}
export async function persistDocumentSave(scope: DocumentSaveScope, attempt: DocumentSaveAttempt) {
  // add, rather than put, prevents replacing an uncertain operation from another tab.
  await transact('readwrite', scope, (store, storageKey) => store.add(attempt, storageKey));
}
export async function removeDocumentSave(scope: DocumentSaveScope, operationId?: string) {
  if (!operationId) {
    await transact('readwrite', scope, (store, storageKey) => store.delete(storageKey));
    return;
  }
  await transact('readwrite', scope, (store, storageKey) => {
    const request = store.get(storageKey);
    request.addEventListener('success', () => {
      if (request.result?.operationId === operationId) store.delete(storageKey);
    });
    return request;
  });
}
